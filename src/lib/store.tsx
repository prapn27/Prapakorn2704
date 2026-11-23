import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TableName } from '../../shared/schema';
import { getAuthInstance, isConfigured } from './firebase';
import { makeApi } from './api';
import { dbName, newId, nextTs, pickData, SlipDB } from './localdb';
import { syncUntilDone } from './sync';
import type { Account, Category, CategoryGroup, NewTransaction, Transaction } from './types';
import { tr } from './i18n';

/**
 * สถาปัตยกรรม: UI อ่าน/เขียน IndexedDB ในเครื่อง (Dexie) เสมอ → ใช้ออฟไลน์ได้เต็มที่
 * ทุกการเขียนจะใส่ลง outbox ในธุรกรรมเดียวกัน แล้ว sync engine ส่งขึ้น Cloudflare D1 และดึงสิ่งที่เปลี่ยนจากเครื่องอื่น
 */

interface DataState {
  user: User | null;
  authReady: boolean;
  /** ข้อมูลในเครื่องพร้อมใช้ (เคย sync สำเร็จอย่างน้อยหนึ่งครั้ง) */
  loaded: boolean;
  online: boolean;
  /** มีการเปลี่ยนแปลงที่ยังไม่ได้ส่งขึ้น server */
  pendingWrites: boolean;
  syncing: boolean;
  /** ข้อความผิดพลาดล่าสุดของการ sync (null = ปกติ) */
  syncError: string | null;
  /** ข้อความแจ้งผู้ใช้จากการ sync เช่น สลิปซ้ำจากอีกเครื่อง */
  notice: string | null;
  accounts: Account[];
  groups: CategoryGroup[];
  categories: Category[];
  transactions: Transaction[];
}

interface DataApi extends DataState {
  categoryById: Map<string, Category>;
  groupById: Map<string, CategoryGroup>;
  accountById: Map<string, Account>;
  addTransaction(t: NewTransaction): void;
  addTransactions(ts: NewTransaction[]): void;
  updateTransaction(id: string, patch: Partial<Transaction>): void;
  deleteTransaction(id: string): void;
  /** ลบหลายรายการในครั้งเดียว (ธุรกรรมเดียว) */
  deleteTransactions(ids: string[]): void;
  saveAccount(a: Omit<Account, 'id'> & { id?: string }): void;
  deleteAccount(id: string): void;
  saveGroup(g: Omit<CategoryGroup, 'id'> & { id?: string }): void;
  deleteGroup(id: string): void;
  saveCategory(c: Omit<Category, 'id'> & { id?: string }): void;
  deleteCategory(id: string): void;
  reorder(kind: 'groups' | 'categories' | 'accounts', ids: string[]): void;
  bulkSetCategory(updates: { id: string; categoryId: string; type: Transaction['type'] }[]): void;
  retrySync(): void;
  dismissNotice(): void;
  /** ซิงก์ก่อนออก — ถ้ายังมีของค้างส่งจะถามยืนยัน แล้วลบข้อมูลในเครื่องของผู้ใช้นี้ */
  signOut(): Promise<void>;
}

const Ctx = createContext<DataApi | null>(null);

type Row = { id: string; [k: string]: unknown };
type Op =
  | { table: TableName; op: 'upsert'; row: Row }
  | { table: TableName; op: 'delete'; id: string };

function fail(e: unknown) {
  console.error(e);
  alert(tr('บันทึกข้อมูลไม่สำเร็จ: {msg}', { msg: String((e as Error)?.message || e) }));
}

/** เขียนลงฐานข้อมูลในเครื่อง + outbox ใน transaction เดียว (อะตอมมิก) */
async function writeOps(db: SlipDB, ops: Op[]) {
  if (!ops.length) return;
  await db.transaction('rw', [...db.dataTables, db.outbox], async () => {
    for (const o of ops) {
      const t = db.tableOf(o.table);
      const ts = nextTs();
      if (o.op === 'upsert') {
        await t.put(o.row);
        await db.outbox.add({ table: o.table, id: o.row.id, op: 'upsert', data: pickData(o.table, o.row), clientUpdatedAt: ts });
      } else {
        await t.delete(o.id);
        await db.outbox.add({ table: o.table, id: o.id, op: 'delete', clientUpdatedAt: ts });
      }
    }
  });
}

const upsert = (table: TableName, row: Row): Op => ({ table, op: 'upsert', row });
const remove = (table: TableName, id: string): Op => ({ table, op: 'delete', id });

export function DataProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isConfigured);
  const [db, setDb] = useState<SlipDB | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---------- auth ----------
  useEffect(() => {
    if (!isConfigured) return;
    return onAuthStateChanged(getAuthInstance(), (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  // ---------- ฐานข้อมูลในเครื่อง (แยกตามผู้ใช้) ----------
  const uid = user?.uid;
  /** uid ที่ต้องลบฐานข้อมูลในเครื่องทิ้งหลังออกจากระบบ */
  const purgeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!uid) {
      setDb(null);
      setLoaded(false);
      return;
    }
    const d = new SlipDB(uid);
    let cancelled = false;
    setLoaded(false);
    d.meta
      .get('rev')
      .then((r) => !cancelled && setLoaded(r !== undefined))
      .catch(fail);
    setDb(d);
    // ขอให้เบราว์เซอร์ไม่ลบข้อมูลในเครื่องเอง (สำคัญเพราะของที่ยังไม่ได้ซิงก์อยู่ที่นี่ที่เดียว)
    navigator.storage?.persist?.().catch(() => undefined);
    return () => {
      cancelled = true;
      // ปิด/ลบช้าลงเล็กน้อย เพื่อให้ live query เลิกสมัครรับข้อมูลก่อน (กัน DatabaseClosedError ระหว่าง render)
      setTimeout(() => {
        d.close();
        if (purgeRef.current === uid) {
          purgeRef.current = null;
          Dexie.delete(dbName(uid)).catch(() => undefined);
        }
      }, 1000);
    };
  }, [uid]);

  // ---------- sync controller ----------
  const dbRef = useRef<SlipDB | null>(null);
  dbRef.current = db;
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const ctl = useRef({ running: null as Promise<void> | null, queued: false, timer: 0, retry: 0, failures: 0 });

  const runSync = useCallback((): Promise<void> => {
    const c = ctl.current;
    if (c.running) {
      c.queued = true;
      return c.running;
    }
    const d = dbRef.current;
    const u = userRef.current;
    if (!d || !u || !navigator.onLine) return Promise.resolve();

    const api = makeApi((force) => u.getIdToken(force));
    setSyncing(true);
    c.running = (async () => {
      try {
        if (!(await d.meta.get('bootstrapped'))) {
          await api.bootstrap(); // สร้างหมวดตั้งต้นฝั่ง server (ครั้งเดียวต่อบัญชี แม้หลายเครื่องพร้อมกัน)
          await d.meta.put({ key: 'bootstrapped', value: true });
        }
        const r = await syncUntilDone(d, api.sync);
        if (dbRef.current !== d) return; // ผู้ใช้เปลี่ยนระหว่างซิงก์
        c.failures = 0;
        setSyncError(null);
        setLoaded(true);
        if (r.notices.length) setNotice([...new Set(r.notices)].join('\n'));
      } catch (e) {
        if (dbRef.current !== d) return;
        c.failures++;
        setSyncError((e as Error)?.message || tr('ซิงก์ไม่สำเร็จ'));
        // ลองใหม่แบบ backoff: 5, 15, 60, 120, 300 วินาที
        const wait = [5, 15, 60, 120, 300][Math.min(c.failures - 1, 4)] * 1000;
        clearTimeout(c.retry);
        c.retry = window.setTimeout(() => runSync(), wait);
      } finally {
        c.running = null;
        setSyncing(false);
        if (c.queued) {
          c.queued = false;
          runSync();
        }
      }
    })();
    return c.running;
  }, []);

  /** รอสักครู่ให้รวมการเขียนหลายครั้งเป็นการซิงก์ครั้งเดียว */
  const scheduleSync = useCallback(() => {
    clearTimeout(ctl.current.timer);
    ctl.current.timer = window.setTimeout(() => runSync(), 1500);
  }, [runSync]);

  useEffect(() => {
    if (!db) return;
    runSync();
    const goOnline = () => {
      setOnline(true);
      runSync();
    };
    const goOffline = () => setOnline(false);
    const visible = () => document.visibilityState === 'visible' && runSync();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', visible);
    const poll = window.setInterval(() => document.visibilityState === 'visible' && runSync(), 60_000);
    const c = ctl.current;
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', visible);
      clearInterval(poll);
      clearTimeout(c.timer);
      clearTimeout(c.retry);
    };
  }, [db, runSync]);

  // ---------- ข้อมูล (live query จากฐานข้อมูลในเครื่อง) ----------
  const accounts = useLiveQuery(() => (db ? db.accounts.orderBy('order').toArray() : []), [db], [] as Account[]);
  const groups = useLiveQuery(() => (db ? db.groups.orderBy('order').toArray() : []), [db], [] as CategoryGroup[]);
  const categories = useLiveQuery(() => (db ? db.categories.orderBy('order').toArray() : []), [db], [] as Category[]);
  const transactions = useLiveQuery(
    () => (db ? db.transactions.orderBy('date').reverse().toArray() : []),
    [db],
    [] as Transaction[]
  );
  const pendingCount = useLiveQuery(() => (db ? db.outbox.count() : 0), [db], 0);

  // ---------- การเขียน ----------
  const api = useMemo<DataApi>(() => {
    const w = (fn: (d: SlipDB) => Promise<Op[]>) => {
      const d = dbRef.current;
      if (!d) return;
      fn(d)
        .then((ops) => writeOps(d, ops))
        .then(scheduleSync)
        .catch(fail);
    };
    const nextOrder = (items: { order: number }[]) => items.reduce((m, i) => Math.max(m, i.order ?? 0), 0) + 1;

    return {
      user,
      authReady,
      loaded,
      online,
      pendingWrites: pendingCount > 0,
      syncing,
      syncError,
      notice,
      accounts,
      groups,
      categories,
      transactions,
      categoryById: new Map(categories.map((c) => [c.id, c])),
      groupById: new Map(groups.map((g) => [g.id, g])),
      accountById: new Map(accounts.map((a) => [a.id, a])),

      addTransaction(t) {
        w(async () => {
          const now = Date.now();
          return [upsert('transactions', { ...t, id: newId(), createdAt: now, updatedAt: now })];
        });
      },
      addTransactions(ts) {
        w(async () => {
          const now = Date.now();
          return ts.map((t) => upsert('transactions', { ...t, id: newId(), createdAt: now, updatedAt: now }));
        });
      },
      updateTransaction(id, patch) {
        w(async (d) => {
          const cur = await d.transactions.get(id);
          return cur ? [upsert('transactions', { ...cur, ...patch, id, updatedAt: Date.now() })] : [];
        });
      },
      deleteTransaction(id) {
        w(async () => [remove('transactions', id)]);
      },
      deleteTransactions(ids) {
        w(async () => ids.map((id) => remove('transactions', id)));
      },

      saveAccount(a) {
        w(async (d) => {
          const cur = a.id ? await d.accounts.get(a.id) : undefined;
          const order = a.order || cur?.order || nextOrder(await d.accounts.toArray());
          return [upsert('accounts', { ...cur, ...a, id: a.id ?? newId(), order })];
        });
      },
      deleteAccount(id) {
        w(async (d) => {
          const txs = await d.transactions.where('accountId').equals(id).toArray();
          return [
            ...txs.map((t) => upsert('transactions', { ...t, accountId: null, updatedAt: Date.now() })),
            remove('accounts', id)
          ];
        });
      },

      saveGroup(g) {
        w(async (d) => {
          const cur = g.id ? await d.groups.get(g.id) : undefined;
          const order = g.order || cur?.order || nextOrder(await d.groups.toArray());
          const id = g.id ?? newId();
          const ops: Op[] = [upsert('groups', { ...cur, ...g, id, order })];
          // เปลี่ยนประเภทกลุ่ม → หมวดในกลุ่มเปลี่ยนตาม
          if (cur && cur.type !== g.type) {
            const cats = await d.categories.where('groupId').equals(id).toArray();
            ops.push(...cats.map((c) => upsert('categories', { ...c, type: g.type })));
          }
          return ops;
        });
      },
      deleteGroup(id) {
        w(async () => [remove('groups', id)]);
      },

      saveCategory(c) {
        w(async (d) => {
          const cur = c.id ? await d.categories.get(c.id) : undefined;
          const order = c.order || cur?.order || nextOrder(await d.categories.toArray());
          return [upsert('categories', { ...cur, ...c, id: c.id ?? newId(), order })];
        });
      },
      deleteCategory(id) {
        w(async (d) => {
          const txs = await d.transactions.where('categoryId').equals(id).toArray();
          return [
            ...txs.map((t) => upsert('transactions', { ...t, categoryId: null, updatedAt: Date.now() })),
            remove('categories', id)
          ];
        });
      },

      reorder(kind, ids) {
        w(async (d) => {
          const table: TableName = kind;
          const rows = await d.tableOf(table).bulkGet(ids);
          const ops: Op[] = [];
          rows.forEach((r, i) => {
            if (r && (r as { order?: number }).order !== i + 1) ops.push(upsert(table, { ...r, order: i + 1 } as Row));
          });
          return ops;
        });
      },
      bulkSetCategory(updates) {
        w(async (d) => {
          const rows = await d.transactions.bulkGet(updates.map((u) => u.id));
          const ops: Op[] = [];
          rows.forEach((r, i) => {
            if (r) ops.push(upsert('transactions', { ...r, categoryId: updates[i].categoryId, type: updates[i].type, updatedAt: Date.now() }));
          });
          return ops;
        });
      },

      retrySync() {
        clearTimeout(ctl.current.retry);
        ctl.current.failures = 0;
        runSync();
      },
      dismissNotice() {
        setNotice(null);
      },
      async signOut() {
        const d = dbRef.current;
        const u = userRef.current;
        if (d && u) {
          await runSync();
          const pending = await d.outbox.count();
          if (pending > 0 && !confirm(tr('ยังมี {n} รายการที่ยังไม่ได้ซิงก์ขึ้น server ถ้าออกจากระบบตอนนี้ข้อมูลส่วนนี้จะหายไป ออกจากระบบต่อไหม?', { n: pending }))) {
            return;
          }
        }
        if (u) purgeRef.current = u.uid;
        await fbSignOut(getAuthInstance());
      }
    };
  }, [user, authReady, loaded, online, pendingCount, syncing, syncError, notice, accounts, groups, categories, transactions, scheduleSync, runSync]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useData(): DataApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
