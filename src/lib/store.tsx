import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  type DocumentData
} from 'firebase/firestore';
import { getFirebase, isConfigured } from './firebase';
import type { Account, Category, CategoryGroup, NewTransaction, Transaction } from './types';
import { DEFAULT_ACCOUNTS, DEFAULT_GROUPS } from './defaults';

/**
 * หมายเหตุเรื่องออฟไลน์: Firestore เขียนลงแคชในเครื่องทันที แต่ promise ของการเขียน
 * จะ resolve เมื่อเซิร์ฟเวอร์ตอบกลับเท่านั้น จึง "ไม่ await" การเขียน
 * (UI อัปเดตจาก onSnapshot ทันทีอยู่แล้ว) แล้วซิงก์ให้เองเมื่อกลับมาออนไลน์
 */
function fire(p: Promise<unknown>) {
  p.catch((e) => {
    console.error(e);
    alert('บันทึกข้อมูลไม่สำเร็จ: ' + (e?.message || e));
  });
}

interface DataState {
  user: User | null;
  authReady: boolean;
  loaded: boolean;
  online: boolean;
  pendingWrites: boolean;
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
  saveAccount(a: Omit<Account, 'id'> & { id?: string }): void;
  deleteAccount(id: string): void;
  saveGroup(g: Omit<CategoryGroup, 'id'> & { id?: string }): void;
  deleteGroup(id: string): void;
  saveCategory(c: Omit<Category, 'id'> & { id?: string }): void;
  deleteCategory(id: string): void;
  reorder(kind: 'groups' | 'categories' | 'accounts', ids: string[]): void;
  bulkSetCategory(updates: { id: string; categoryId: string; type: Transaction['type'] }[]): void;
}

const Ctx = createContext<DataApi | null>(null);

const COLS = ['accounts', 'groups', 'categories', 'transactions'] as const;

function strip<T extends object>(o: T): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== 'id') out[k] = v;
  return out;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    user: null,
    authReady: !isConfigured,
    loaded: false,
    online: navigator.onLine,
    pendingWrites: false,
    accounts: [],
    groups: [],
    categories: [],
    transactions: []
  });

  useEffect(() => {
    const on = () => setState((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) =>
      setState((s) => ({
        ...s,
        user,
        authReady: true,
        loaded: user ? s.loaded && s.user?.uid === user.uid : false,
        ...(user ? {} : { accounts: [], groups: [], categories: [], transactions: [] })
      }))
    );
  }, []);

  const uid = state.user?.uid;

  useEffect(() => {
    if (!uid) return;
    const { db } = getFirebase();
    const base = `users/${uid}`;
    const done = new Set<string>();
    const pending: Record<string, boolean> = {};

    seedIfNeeded(uid).catch((e) => console.warn('seed skipped', e));

    const unsubs = COLS.map((name) => {
      const q =
        name === 'transactions'
          ? query(collection(db, base, name), orderBy('date', 'desc'))
          : query(collection(db, base, name), orderBy('order'));
      return onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          done.add(name);
          pending[name] = snap.metadata.hasPendingWrites;
          setState((s) => ({
            ...s,
            [name]: items,
            loaded: done.size === COLS.length,
            pendingWrites: Object.values(pending).some(Boolean)
          }));
        },
        (err) => console.error(name, err)
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const api = useMemo<DataApi>(() => {
    const col = (name: string) => collection(getFirebase().db, `users/${uid}`, name);
    const ref = (name: string, id: string) => doc(getFirebase().db, `users/${uid}`, name, id);
    const nextOrder = (items: { order: number }[]) =>
      items.reduce((m, i) => Math.max(m, i.order ?? 0), 0) + 1;

    const save = <T extends { id?: string }>(name: string, items: { order: number }[], v: T) => {
      if (v.id) fire(updateDoc(ref(name, v.id), strip(v)));
      else {
        const d = doc(col(name));
        fire(setDoc(d, { ...strip(v), order: (v as any).order || nextOrder(items) }));
      }
    };

    return {
      ...state,
      categoryById: new Map(state.categories.map((c) => [c.id, c])),
      groupById: new Map(state.groups.map((g) => [g.id, g])),
      accountById: new Map(state.accounts.map((a) => [a.id, a])),

      addTransaction(t) {
        const now = Date.now();
        fire(setDoc(doc(col('transactions')), strip({ ...t, createdAt: now, updatedAt: now })));
      },
      addTransactions(ts) {
        const { db } = getFirebase();
        const now = Date.now();
        // batch จำกัด 500 รายการต่อครั้ง
        for (let i = 0; i < ts.length; i += 450) {
          const b = writeBatch(db);
          ts.slice(i, i + 450).forEach((t) =>
            b.set(doc(col('transactions')), strip({ ...t, createdAt: now, updatedAt: now }))
          );
          fire(b.commit());
        }
      },
      updateTransaction(id, patch) {
        fire(updateDoc(ref('transactions', id), strip({ ...patch, updatedAt: Date.now() })));
      },
      deleteTransaction(id) {
        fire(deleteDoc(ref('transactions', id)));
      },
      saveAccount(a) {
        save('accounts', state.accounts, a);
      },
      deleteAccount(id) {
        const { db } = getFirebase();
        const b = writeBatch(db);
        state.transactions
          .filter((t) => t.accountId === id)
          .forEach((t) => b.update(ref('transactions', t.id), { accountId: null }));
        b.delete(ref('accounts', id));
        fire(b.commit());
      },
      saveGroup(g) {
        const { db } = getFirebase();
        if (g.id) {
          // ถ้าเปลี่ยนประเภทกลุ่ม ให้หมวดในกลุ่มเปลี่ยนตาม
          const old = state.groups.find((x) => x.id === g.id);
          const b = writeBatch(db);
          b.update(ref('groups', g.id), strip(g));
          if (old && old.type !== g.type) {
            state.categories
              .filter((c) => c.groupId === g.id)
              .forEach((c) => b.update(ref('categories', c.id), { type: g.type }));
          }
          fire(b.commit());
        } else save('groups', state.groups, g);
      },
      deleteGroup(id) {
        fire(deleteDoc(ref('groups', id)));
      },
      saveCategory(c) {
        save('categories', state.categories, c);
      },
      deleteCategory(id) {
        const { db } = getFirebase();
        const b = writeBatch(db);
        state.transactions
          .filter((t) => t.categoryId === id)
          .forEach((t) => b.update(ref('transactions', t.id), { categoryId: null }));
        b.delete(ref('categories', id));
        fire(b.commit());
      },
      reorder(kind, ids) {
        const { db } = getFirebase();
        const b = writeBatch(db);
        ids.forEach((id, i) => b.update(ref(kind, id), { order: i + 1 }));
        fire(b.commit());
      },
      bulkSetCategory(updates) {
        const { db } = getFirebase();
        for (let i = 0; i < updates.length; i += 450) {
          const b = writeBatch(db);
          updates
            .slice(i, i + 450)
            .forEach((u) =>
              b.update(ref('transactions', u.id), { categoryId: u.categoryId, type: u.type, updatedAt: Date.now() })
            );
          fire(b.commit());
        }
      }
    };
  }, [state, uid]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useData(): DataApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}

/** สร้างหมวดหมู่และบัญชีตั้งต้นให้ผู้ใช้ใหม่ (ครั้งเดียว) */
async function seedIfNeeded(uid: string) {
  const { db } = getFirebase();
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return;
  const b = writeBatch(db);
  b.set(userRef, { createdAt: Date.now(), seeded: true });
  DEFAULT_ACCOUNTS.forEach((a, i) =>
    b.set(doc(collection(db, `users/${uid}/accounts`)), { ...a, initialBalance: 0, order: i + 1 })
  );
  let catOrder = 1;
  DEFAULT_GROUPS.forEach((g, gi) => {
    const gRef = doc(collection(db, `users/${uid}/groups`));
    b.set(gRef, { name: g.name, type: g.type, color: g.color, order: gi + 1 });
    g.categories.forEach(([name, icon, keywords]) =>
      b.set(doc(collection(db, `users/${uid}/categories`)), {
        name,
        icon,
        keywords,
        groupId: gRef.id,
        type: g.type,
        budget: 0,
        order: catOrder++
      })
    );
  });
  await b.commit();
}
