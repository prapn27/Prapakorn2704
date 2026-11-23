import { SPECS } from './tables';
import { TABLE_NAMES } from '../shared/schema';

export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * ลบแถว deleted=1 ที่เก่ากว่า 90 วัน (ตามเวลาฝั่ง server) และจด rev สูงสุดที่ลบไว้ใน users.purged_rev
 * เครื่องที่ sync ล่าสุดก่อน rev นั้นจะถูกบอกให้โหลดใหม่ทั้งหมด (full) เพราะอาจพลาดการลบ
 */
export async function purgeTombstones(db: D1Database, now = Date.now(), ttl = TOMBSTONE_TTL_MS) {
  const cutoff = now - ttl;
  const stmts: D1PreparedStatement[] = [];
  for (const name of TABLE_NAMES) {
    const t = SPECS[name].table;
    stmts.push(
      db
        .prepare(
          `UPDATE users SET purged_rev = MAX(purged_rev, COALESCE(
             (SELECT MAX(rev) FROM ${t} WHERE user_id = users.id AND deleted = 1 AND server_updated_at < ?), 0))
           WHERE id IN (SELECT DISTINCT user_id FROM ${t} WHERE deleted = 1 AND server_updated_at < ?)`
        )
        .bind(cutoff, cutoff),
      db.prepare(`DELETE FROM ${t} WHERE deleted = 1 AND server_updated_at < ?`).bind(cutoff)
    );
  }
  const res = await db.batch(stmts);
  return res.filter((_, i) => i % 2 === 1).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}
