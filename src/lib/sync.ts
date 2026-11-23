import { MAX_MUTATIONS, TABLE_NAMES, type SyncRequest, type SyncResponse, type TableName, type WireRow } from '../../shared/schema';
import type { OutboxItem, SlipDB } from './localdb';

export type PostFn = (req: SyncRequest) => Promise<SyncResponse>;

const key = (table: string, id: string) => `${table}:${id}`;

function toWire(o: OutboxItem) {
  return {
    table: o.table,
    id: o.id,
    op: o.op,
    ...(o.op === 'upsert' ? { data: o.data } : {}),
    clientUpdatedAt: o.clientUpdatedAt
  };
}

/** แถวจาก server → แถวในเครื่อง (ตัดฟิลด์ของ sync ออก) */
function fromWire(row: WireRow) {
  const { rev: _rev, deleted: _deleted, clientUpdatedAt: _cu, ...rest } = row;
  return rest as { id: string };
}

async function loadMeta<T>(db: SlipDB, k: string): Promise<T | undefined> {
  return (await db.meta.get(k))?.value as T | undefined;
}

/**
 * ผลของการส่ง 1 รอบลงฐานข้อมูลในเครื่อง (ทั้งหมดอยู่ใน transaction เดียว — ถ้าพังกลางทางจะไม่เหลือสถานะครึ่ง ๆ กลาง ๆ)
 * กฎสำคัญ: แถวที่ยังมี mutation ค้างใน outbox จะไม่ถูกทับด้วยข้อมูลจาก server เพราะของในเครื่องใหม่กว่า
 */
async function applyResponse(db: SlipDB, batch: OutboxItem[], res: SyncResponse, notices: string[]) {
  await db.transaction('rw', [...db.dataTables, db.outbox, db.meta], async () => {
    // 1) เอา mutation ที่ server ตอบแล้ว (รับหรือปฏิเสธ) ออกจาก outbox
    const handled = new Set<number>([...res.applied, ...res.rejected.map((r) => r.index)]);
    await db.outbox.bulkDelete(batch.filter((_, i) => handled.has(i)).map((b) => b.seq!));

    // 2) mutation ที่ถูกปฏิเสธ
    for (const r of res.rejected) {
      if (r.reason === 'duplicate_slip') {
        const tx = await db.transactions.get(r.id);
        await db.transactions.delete(r.id);
        notices.push(`สลิปนี้ถูกนำเข้าจากอีกเครื่องแล้ว จึงลบรายการซ้ำออก${tx ? ` (${tx.amount.toLocaleString('th-TH')} บาท)` : ''}`);
      } else {
        notices.push('มีรายการที่ server ไม่รับเพราะข้อมูลไม่ถูกต้อง จึงไม่ถูกซิงก์');
      }
      // mutation อื่นที่ค้างของแถวเดียวกันไม่มีความหมายแล้ว
      await db.outbox.where('id').equals(r.id).filter((o) => o.table === r.table).delete();
    }

    const pending = new Set((await db.outbox.toArray()).map((o) => key(o.table, o.id)));

    // 3) โหลดใหม่ทั้งหมด: ล้างข้อมูลในเครื่องยกเว้นแถวที่ยังมีของค้างส่ง
    if (res.full) {
      for (const name of TABLE_NAMES) {
        const t = db.tableOf(name);
        const ids = (await t.toCollection().primaryKeys()).filter((id) => !pending.has(key(name, id)));
        await t.bulkDelete(ids);
      }
    }

    // 4) ใส่ข้อมูลที่เปลี่ยนจาก server
    for (const name of TABLE_NAMES) {
      const t = db.tableOf(name);
      const put: { id: string }[] = [];
      const del: string[] = [];
      for (const row of res.changes[name]) {
        if (pending.has(key(name, row.id))) continue;
        if (row.deleted) del.push(row.id);
        else put.push(fromWire(row));
      }
      if (put.length) await t.bulkPut(put);
      if (del.length) await t.bulkDelete(del);
    }

    // 5) บันทึก cursor + สถานะโหลดใหม่ ใน transaction เดียวกับข้อมูล
    const wasReloading = Boolean(await loadMeta<boolean>(db, 'reloading'));
    await db.meta.put({ key: 'rev', value: res.rev });
    await db.meta.put({ key: 'reloading', value: res.more && (res.full || wasReloading) });
  });
}

export interface SyncResult {
  rounds: number;
  notices: string[];
}

/** ส่ง outbox และดึงข้อมูลใหม่วนจนหมด (ส่งครั้งละ ≤ MAX_MUTATIONS) — โยน error ถ้าติดต่อ server ไม่ได้ outbox จะยังอยู่ครบ */
export async function syncUntilDone(db: SlipDB, post: PostFn): Promise<SyncResult> {
  const notices: string[] = [];
  for (let round = 1; round <= 2000; round++) {
    const batch = await db.outbox.orderBy('seq').limit(MAX_MUTATIONS).toArray();
    const since = (await loadMeta<number>(db, 'rev')) ?? 0;
    const reload = Boolean(await loadMeta<boolean>(db, 'reloading'));

    const res = await post({ since, ...(reload ? { reload } : {}), mutations: batch.map(toWire) });
    if (batch.length > 0 && res.applied.length + res.rejected.length === 0) {
      throw new Error('server ไม่รับ mutation ใดเลย');
    }
    await applyResponse(db, batch, res, notices);

    if (!res.more && (await db.outbox.count()) === 0) return { rounds: round, notices };
  }
  throw new Error('sync วนเกินจำนวนรอบที่กำหนด');
}

export type { TableName };
