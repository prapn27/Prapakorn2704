import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_MUTATIONS, type SyncRequest, type SyncResponse, type WireRow } from '../../shared/schema';
import { pickData, SlipDB, type OutboxItem } from './localdb';
import { syncUntilDone, type PostFn } from './sync';

let n = 0;
const dbs: SlipDB[] = [];
function mkDb() {
  const db = new SlipDB(`test-${Date.now()}-${++n}`);
  dbs.push(db);
  return db;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete();
});

const empty = () => ({ accounts: [], groups: [], categories: [], transactions: [] });
const res = (over: Partial<SyncResponse> = {}, req?: SyncRequest): SyncResponse => ({
  rev: 1,
  applied: req ? req.mutations.map((_, i) => i) : [],
  rejected: [],
  full: false,
  more: false,
  changes: empty(),
  ...over
});
const wire = (id: string, extra: Record<string, unknown> = {}, deleted = false): WireRow => ({
  id, rev: 5, deleted, clientUpdatedAt: 99, ...extra
});
const tx = (id: string, over: Record<string, unknown> = {}) => ({
  id, type: 'expense', amount: 10, date: '2026-11-22T10:00', categoryId: null, accountId: null,
  note: '', source: 'manual', slipRef: null, bank: null, createdAt: 1, ...over
});
const upsertItem = (id: string, row = tx(id)): Omit<OutboxItem, 'seq'> => ({
  table: 'transactions', id, op: 'upsert', data: pickData('transactions', row), clientUpdatedAt: Date.now()
});

describe('syncUntilDone', () => {
  it('ส่ง outbox ครั้งละไม่เกิน MAX_MUTATIONS เรียงตามลำดับ แล้วเคลียร์จนหมด', async () => {
    const db = mkDb();
    const total = MAX_MUTATIONS * 2 + 10;
    for (let i = 0; i < total; i++) await db.outbox.add(upsertItem(`tx-${String(i).padStart(6, '0')}`));

    const sent: string[][] = [];
    const post: PostFn = async (req) => {
      sent.push(req.mutations.map((m) => m.id));
      return res({ rev: sent.length }, req);
    };
    const r = await syncUntilDone(db, post);
    expect(sent.map((s) => s.length)).toEqual([MAX_MUTATIONS, MAX_MUTATIONS, 10]);
    expect(sent.flat()).toEqual(Array.from({ length: total }, (_, i) => `tx-${String(i).padStart(6, '0')}`));
    expect(await db.outbox.count()).toBe(0);
    expect(r.rounds).toBe(3);
    expect((await db.meta.get('rev'))?.value).toBe(3);
  });

  it('ส่ง delete โดยไม่มี data และ upsert พร้อม data', async () => {
    const db = mkDb();
    await db.outbox.bulkAdd([upsertItem('tx-000001'), { table: 'transactions', id: 'tx-000002', op: 'delete', clientUpdatedAt: 5 }]);
    let req!: SyncRequest;
    await syncUntilDone(db, async (r) => ((req = r), res({}, r)));
    expect(req.mutations[0]).toMatchObject({ op: 'upsert', data: { amount: 10 } });
    expect(req.mutations[1]).toEqual({ table: 'transactions', id: 'tx-000002', op: 'delete', clientUpdatedAt: 5 });
    expect(req.since).toBe(0);
  });

  it('ใส่ข้อมูลที่เปลี่ยนจาก server และลบแถว tombstone โดยตัดฟิลด์ของ sync ออก', async () => {
    const db = mkDb();
    await db.transactions.bulkPut([tx('tx-000001'), tx('tx-000002')] as never);
    const out = await syncUntilDone(db, async () =>
      res({
        rev: 9,
        changes: {
          ...empty(),
          transactions: [wire('tx-000001', { amount: 77, note: 'จากเครื่องอื่น' }, false), wire('tx-000002', {}, true), wire('tx-000003', { ...tx('tx-000003') })],
          categories: [wire('cat-000001', { name: 'อาหาร', groupId: 'grp-000001', type: 'expense', icon: '🍚', keywords: ['ข้าว'], budget: 0, order: 1 })]
        }
      })
    );
    expect(out.notices).toEqual([]);
    const rows = await db.transactions.toArray();
    expect(rows.map((r) => r.id).sort()).toEqual(['tx-000001', 'tx-000003']);
    const one = (await db.transactions.get('tx-000001'))! as unknown as Record<string, unknown>;
    expect(one.amount).toBe(77);
    expect(one).not.toHaveProperty('rev');
    expect(one).not.toHaveProperty('deleted');
    expect(one).not.toHaveProperty('clientUpdatedAt');
    expect((await db.categories.get('cat-000001'))?.keywords).toEqual(['ข้าว']);
    expect((await db.meta.get('rev'))?.value).toBe(9);
  });

  it('ไม่ทับแถวที่ยังมี mutation ค้างอยู่ใน outbox (ของในเครื่องใหม่กว่า)', async () => {
    const db = mkDb();
    await db.transactions.put(tx('tx-000001', { amount: 500, note: 'แก้ในเครื่อง' }) as never);
    // mutation ที่ค้างอยู่ของ tx-000001 เป็นตัวที่ 31 จึงยังไม่ถูกส่งในรอบแรก
    for (let i = 0; i < MAX_MUTATIONS; i++) await db.outbox.add(upsertItem(`other-${String(i).padStart(4, '0')}`));
    await db.outbox.add(upsertItem('tx-000001', tx('tx-000001', { amount: 500 })));

    let calls = 0;
    await syncUntilDone(db, async (req) => {
      calls++;
      return res(calls === 1 ? { rev: 4, changes: { ...empty(), transactions: [wire('tx-000001', { ...tx('tx-000001', { amount: 1, note: 'เก่าจาก server' }) })] } } : { rev: 5 }, req);
    });
    expect((await db.transactions.get('tx-000001'))?.amount).toBe(500);
    expect(await db.outbox.count()).toBe(0);
  });

  it('mutation ที่แพ้ last-write-wins: แถวปัจจุบันของ server ถูกใส่ทับของในเครื่อง', async () => {
    const db = mkDb();
    await db.transactions.put(tx('tx-000001', { amount: 1 }) as never);
    await db.outbox.add(upsertItem('tx-000001', tx('tx-000001', { amount: 1 })));
    await syncUntilDone(db, async (req) =>
      res({ rev: 7, changes: { ...empty(), transactions: [wire('tx-000001', { ...tx('tx-000001', { amount: 999 }) })] } }, req)
    );
    expect((await db.transactions.get('tx-000001'))?.amount).toBe(999);
  });

  it('สลิปซ้ำที่ server ปฏิเสธ: ลบรายการในเครื่อง แจ้งผู้ใช้ และทิ้ง mutation ค้างของรายการนั้น', async () => {
    const db = mkDb();
    const dup = tx('tx-000001', { source: 'slip', slipRef: '014:AAA', amount: 1250 });
    await db.transactions.put(dup as never);
    await db.outbox.bulkAdd([upsertItem('tx-000001', dup), upsertItem('tx-000001', { ...dup, note: 'แก้ต่อ' })]);
    // รอบแรกส่งทั้งสองตัวพร้อมกัน server ปฏิเสธตัวแรก ตัวที่สองก็ปฏิเสธเช่นกัน
    const out = await syncUntilDone(db, async (req) =>
      res({
        applied: [],
        rejected: req.mutations.map((m, index) => ({ index, id: m.id, table: m.table, reason: 'duplicate_slip' as const }))
      })
    );
    expect(await db.transactions.get('tx-000001')).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
    expect(out.notices).toHaveLength(2);
    expect(out.notices[0]).toContain('สลิป');
  });

  it('full reload: ล้างข้อมูลในเครื่องยกเว้นแถวที่มีของค้างส่ง แล้วโหลดต่อด้วย reload=true จนหมด', async () => {
    const db = mkDb();
    await db.transactions.bulkPut([tx('old-000001'), tx('keep-00001', { note: 'ยังไม่ได้ส่ง' })] as never);
    await db.meta.put({ key: 'rev', value: 3 });
    await db.outbox.add(upsertItem('keep-00001', tx('keep-00001', { note: 'ยังไม่ได้ส่ง' })));

    const reqs: SyncRequest[] = [];
    const pages: SyncResponse[] = [
      res({ full: true, more: true, rev: 100, applied: [0], changes: { ...empty(), transactions: [wire('new-000001', { ...tx('new-000001') })] } }),
      res({ rev: 150, changes: { ...empty(), transactions: [wire('new-000002', { ...tx('new-000002') })] } })
    ];
    await syncUntilDone(db, async (req) => {
      reqs.push(req);
      return pages[reqs.length - 1];
    });
    expect((await db.transactions.toArray()).map((r) => r.id).sort()).toEqual(['new-000001', 'new-000002']);
    // keep-00001 ถูกส่งขึ้นแล้วในรอบแรก (applied) แต่ server ไม่ได้ส่งกลับ จึงหายจากเครื่อง — ต้องไม่หายถ้ายังค้างอยู่
    expect(reqs[0].since).toBe(3);
    expect(reqs[0].reload).toBeUndefined();
    expect(reqs[1].since).toBe(100);
    expect(reqs[1].reload).toBe(true);
    expect((await db.meta.get('reloading'))?.value).toBe(false);
    expect((await db.meta.get('rev'))?.value).toBe(150);
  });

  it('full reload ไม่ลบแถวที่ยังค้างส่ง (ส่งไม่หมดในรอบเดียว)', async () => {
    const db = mkDb();
    await db.transactions.put(tx('keep-00001', { note: 'ค้าง' }) as never);
    await db.meta.put({ key: 'rev', value: 3 });
    for (let i = 0; i < MAX_MUTATIONS; i++) await db.outbox.add(upsertItem(`fill-${String(i).padStart(5, '0')}`));
    await db.outbox.add(upsertItem('keep-00001', tx('keep-00001', { note: 'ค้าง' })));

    let calls = 0;
    await syncUntilDone(db, async (req) => {
      calls++;
      return calls === 1 ? res({ full: true, rev: 50 }, req) : res({ rev: 51 }, req);
    });
    expect((await db.transactions.get('keep-00001'))?.note).toBe('ค้าง');
  });

  it('ถ้ากำลังโหลดใหม่ค้างอยู่ตอนเปิดแอพใหม่ ให้ส่ง reload=true ต่อ', async () => {
    const db = mkDb();
    await db.meta.bulkPut([{ key: 'rev', value: 40 }, { key: 'reloading', value: true }]);
    let req!: SyncRequest;
    await syncUntilDone(db, async (r) => ((req = r), res({ rev: 60 })));
    expect(req).toMatchObject({ since: 40, reload: true });
    expect((await db.meta.get('reloading'))?.value).toBe(false);
  });

  it('ตัดหน้า (more) วนเรียกจนหมด', async () => {
    const db = mkDb();
    const revs: number[] = [];
    let i = 0;
    await syncUntilDone(db, async (req) => {
      revs.push(req.since);
      i++;
      return res({ rev: i * 10, more: i < 3 });
    });
    expect(revs).toEqual([0, 10, 20]);
  });

  it('ติดต่อ server ไม่ได้: outbox และ cursor ไม่เปลี่ยน', async () => {
    const db = mkDb();
    await db.outbox.add(upsertItem('tx-000001'));
    await db.meta.put({ key: 'rev', value: 8 });
    await expect(syncUntilDone(db, async () => { throw new Error('network'); })).rejects.toThrow('network');
    expect(await db.outbox.count()).toBe(1);
    expect((await db.meta.get('rev'))?.value).toBe(8);
  });

  it('server ไม่รับ mutation ใดเลย → โยน error ไม่วนไม่จบ', async () => {
    const db = mkDb();
    await db.outbox.add(upsertItem('tx-000001'));
    await expect(syncUntilDone(db, async () => res({ applied: [] }))).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);
  });
});

describe('pickData', () => {
  it('เลือกเฉพาะฟิลด์ที่ server รับ', () => {
    const d = pickData('transactions', { ...tx('tx-000001'), updatedAt: 5, junk: 'x', rev: 3 });
    expect(Object.keys(d).sort()).toEqual(
      ['accountId', 'amount', 'bank', 'categoryId', 'createdAt', 'date', 'note', 'slipRef', 'source', 'type'].sort()
    );
  });
});
