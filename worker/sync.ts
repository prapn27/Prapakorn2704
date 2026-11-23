import {
  DATA_SCHEMAS,
  PAGE_SIZE,
  TABLE_NAMES,
  type Mutation,
  type RejectReason,
  type SyncRequest,
  type SyncResponse,
  type TableName,
  type WireRow
} from '../shared/schema';
import { SPECS } from './tables';

type Row = Record<string, unknown>;

function rowToWire(table: TableName, r: Row): WireRow {
  const out: WireRow = {
    id: r.id as string,
    rev: r.rev as number,
    deleted: r.deleted === 1,
    clientUpdatedAt: r.client_updated_at as number
  };
  for (const f of SPECS[table].fields) {
    const v = r[f.col];
    out[f.key] = f.json ? JSON.parse(String(v ?? '[]')) : v;
  }
  return out;
}

function upsertStmt(db: D1Database, uid: string, table: TableName, m: Mutation, data: Row, now: number) {
  const spec = SPECS[table];
  const cols = spec.fields.map((f) => f.col);
  const vals = spec.fields.map((f) => {
    const v = data[f.key];
    return f.json ? JSON.stringify(v ?? []) : (v ?? null);
  });
  const t = spec.table;
  const sql = `INSERT INTO ${t} (id, user_id, ${cols.join(', ')}, rev, client_updated_at, server_updated_at, deleted)
    VALUES (?, ?, ${cols.map(() => '?').join(', ')}, (SELECT rev FROM users WHERE id = ?), ?, ?, 0)
    ON CONFLICT (user_id, id) DO UPDATE SET
      ${cols.map((c) => `${c} = excluded.${c}`).join(', ')},
      rev = excluded.rev, client_updated_at = excluded.client_updated_at,
      server_updated_at = excluded.server_updated_at, deleted = 0
    WHERE excluded.client_updated_at >= ${t}.client_updated_at`;
  return db.prepare(sql).bind(m.id, uid, ...vals, uid, m.clientUpdatedAt, now);
}

function deleteStmt(db: D1Database, uid: string, table: TableName, m: Mutation, now: number) {
  const t = SPECS[table].table;
  return db
    .prepare(
      `UPDATE ${t} SET deleted = 1, rev = (SELECT rev FROM users WHERE id = ?),
         client_updated_at = ?, server_updated_at = ?
       WHERE user_id = ? AND id = ? AND client_updated_at <= ?`
    )
    .bind(uid, m.clientUpdatedAt, now, uid, m.id, m.clientUpdatedAt);
}

interface Planned {
  index: number;
  m: Mutation;
  stmt: D1PreparedStatement;
}

/** ตรวจข้อมูลและสลิปซ้ำ แล้วสร้าง statement ของแต่ละ mutation */
async function plan(db: D1Database, uid: string, muts: Mutation[], now: number) {
  const rejected: SyncResponse['rejected'] = [];
  const parsed: { index: number; m: Mutation; data: Row | null }[] = [];

  muts.forEach((m, index) => {
    if (m.op === 'delete') {
      parsed.push({ index, m, data: null });
      return;
    }
    const r = DATA_SCHEMAS[m.table].safeParse(m.data);
    if (!r.success) rejected.push({ index, id: m.id, table: m.table, reason: 'invalid' });
    else parsed.push({ index, m, data: r.data as Row });
  });

  // กันสลิปซ้ำ: เทียบกับของเดิมใน DB และภายใน request เดียวกัน
  const refs = [...new Set(parsed.filter((p) => p.m.table === 'transactions' && p.data?.slipRef).map((p) => p.data!.slipRef as string))];
  const existing = new Map<string, string>();
  if (refs.length) {
    const res = await db
      .prepare(
        `SELECT id, slip_ref FROM transactions WHERE user_id = ? AND deleted = 0 AND slip_ref IN (${refs.map(() => '?').join(',')})`
      )
      .bind(uid, ...refs)
      .all<{ id: string; slip_ref: string }>();
    for (const r of res.results) existing.set(r.slip_ref, r.id);
  }
  const claimed = new Map<string, string>();
  const deletedEarlier = new Set<string>();
  const planned: Planned[] = [];

  for (const p of parsed) {
    const { index, m, data } = p;
    if (m.op === 'delete') {
      if (m.table === 'transactions') deletedEarlier.add(m.id);
      planned.push({ index, m, stmt: deleteStmt(db, uid, m.table, m, now) });
      continue;
    }
    if (m.table === 'transactions' && data?.slipRef) {
      const ref = data.slipRef as string;
      const owner = existing.get(ref);
      const taken = (owner && owner !== m.id && !deletedEarlier.has(owner)) || (claimed.has(ref) && claimed.get(ref) !== m.id);
      if (taken) {
        rejected.push({ index, id: m.id, table: m.table, reason: 'duplicate_slip' as RejectReason });
        continue;
      }
      claimed.set(ref, m.id);
    }
    planned.push({ index, m, stmt: upsertStmt(db, uid, m.table, m, data!, now) });
  }
  return { planned, rejected };
}

export async function sync(db: D1Database, uid: string, req: SyncRequest, now = Date.now()): Promise<SyncResponse> {
  const [, userRes] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO users (id, rev, purged_rev, seeded, created_at) VALUES (?, 0, 0, 0, ?)').bind(uid, now),
    db.prepare('SELECT rev, purged_rev FROM users WHERE id = ?').bind(uid)
  ]);
  const user = userRes.results[0] as { rev: number; purged_rev: number };

  // เครื่องที่ตามไม่ทัน (tombstone ถูกลบไปแล้ว) หรือล้ำหน้า server (DB ถูกรีเซ็ต) → ให้โหลดใหม่ทั้งหมด
  // หมายเหตุ: ค่า purged_rev อ่านก่อนเข้า batch มีช่องว่างเสี่ยงสั้นมากหากชนกับ cron purge — ยอมรับได้
  const full = !req.reload && req.since > 0 && (req.since < user.purged_rev || req.since > user.rev);
  const since = full ? 0 : req.since;
  const includeDeleted = since > 0;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { planned, rejected } = await plan(db, uid, req.mutations, now);
    const stmts: D1PreparedStatement[] = [];
    if (planned.length) stmts.push(db.prepare('UPDATE users SET rev = rev + 1 WHERE id = ?').bind(uid));
    const first = stmts.length;
    planned.forEach((p) => stmts.push(p.stmt));
    const readStart = stmts.length;
    stmts.push(db.prepare('SELECT rev FROM users WHERE id = ?').bind(uid));
    for (const name of TABLE_NAMES) {
      stmts.push(
        db
          .prepare(
            `SELECT * FROM ${SPECS[name].table} WHERE user_id = ? AND rev > ?${includeDeleted ? '' : ' AND deleted = 0'} ORDER BY rev LIMIT ${PAGE_SIZE}`
          )
          .bind(uid, since)
      );
    }

    let results: D1Result[];
    try {
      results = await db.batch(stmts);
    } catch (e) {
      // ชนกับ unique index ของสลิป (สองเครื่องส่งพร้อมกัน) → วางแผนใหม่ ซึ่งจะเจอรายการที่ซ้ำและ reject
      lastErr = e;
      continue;
    }

    const applied: number[] = [];
    const lost: Planned[] = [];
    planned.forEach((p, i) => {
      applied.push(p.index);
      if ((results[first + i].meta.changes ?? 0) === 0) lost.push(p);
    });

    const currentRev = (results[readStart].results[0] as { rev: number }).rev;
    const changes = { accounts: [], groups: [], categories: [], transactions: [] } as Record<TableName, WireRow[]>;
    let cursor = currentRev;
    let more = false;
    TABLE_NAMES.forEach((name, i) => {
      const rows = results[readStart + 1 + i].results as Row[];
      changes[name] = rows.map((r) => rowToWire(name, r));
      if (rows.length >= PAGE_SIZE) {
        more = true;
        // ตัดหน้ากลางกลุ่ม rev เดียวกันได้ → ถอยหนึ่ง rev เพื่อไม่ให้ตกหล่น (ส่งซ้ำได้ ไม่เสียหาย)
        cursor = Math.min(cursor, (rows[rows.length - 1].rev as number) - 1);
      }
    });

    // mutation ที่แพ้ last-write-wins: ส่งแถวปัจจุบันของ server กลับไป เพื่อให้ client แก้ของในเครื่องให้ตรงกัน
    // (rev ของแถวนั้นอาจต่ำกว่า since จึงไม่อยู่ใน changes ปกติ)
    if (lost.length) {
      const byTable = new Map<TableName, string[]>();
      for (const p of lost) byTable.set(p.m.table, [...(byTable.get(p.m.table) ?? []), p.m.id]);
      const fetches = [...byTable.entries()];
      const res = await db.batch(
        fetches.map(([name, ids]) =>
          db
            .prepare(`SELECT * FROM ${SPECS[name].table} WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
            .bind(uid, ...ids)
        )
      );
      fetches.forEach(([name], i) => {
        const have = new Set(changes[name].map((r) => r.id));
        for (const r of res[i].results as Row[]) if (!have.has(r.id as string)) changes[name].push(rowToWire(name, r));
      });
    }

    return { rev: cursor, applied, rejected, full, more, changes };
  }
  throw lastErr instanceof Error ? lastErr : new Error('sync failed');
}
