import { DEFAULT_ACCOUNTS, DEFAULT_GROUPS } from '../shared/defaults';

/**
 * สร้างหมวดหมู่ กลุ่ม และบัญชีตั้งต้นให้ผู้ใช้ใหม่ "ครั้งเดียว" แม้เรียกพร้อมกันหลายเครื่อง
 * ทุก statement อยู่ใน batch (transaction) เดียว และแต่ละ insert มีเงื่อนไข seeded = 0
 * เครื่องที่มาทีหลังจึงเห็น seeded = 1 แล้วไม่แทรกอะไรเพิ่ม
 */
export async function bootstrap(db: D1Database, uid: string, now = Date.now()): Promise<{ seeded: boolean }> {
  const notSeeded = '(SELECT seeded FROM users WHERE id = ?) = 0';
  const rev = '(SELECT rev FROM users WHERE id = ?)';
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT OR IGNORE INTO users (id, rev, purged_rev, seeded, created_at) VALUES (?, 0, 0, 0, ?)').bind(uid, now),
    db.prepare('UPDATE users SET rev = rev + 1 WHERE id = ? AND seeded = 0').bind(uid)
  ];

  DEFAULT_ACCOUNTS.forEach((a, i) =>
    stmts.push(
      db
        .prepare(
          `INSERT INTO accounts (id, user_id, name, initial_balance, color, ord, rev, client_updated_at, server_updated_at, deleted)
           SELECT ?, ?, ?, 0, ?, ?, ${rev}, ?, ?, 0 WHERE ${notSeeded}`
        )
        .bind(crypto.randomUUID(), uid, a.name, a.color, i + 1, uid, now, now, uid)
    )
  );

  let catOrder = 1;
  DEFAULT_GROUPS.forEach((g, gi) => {
    const gid = crypto.randomUUID();
    stmts.push(
      db
        .prepare(
          `INSERT INTO category_groups (id, user_id, name, type, color, ord, rev, client_updated_at, server_updated_at, deleted)
           SELECT ?, ?, ?, ?, ?, ?, ${rev}, ?, ?, 0 WHERE ${notSeeded}`
        )
        .bind(gid, uid, g.name, g.type, g.color, gi + 1, uid, now, now, uid)
    );
    for (const [name, icon, keywords] of g.categories) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO categories (id, user_id, name, group_id, type, icon, keywords, budget, ord, rev, client_updated_at, server_updated_at, deleted)
             SELECT ?, ?, ?, ?, ?, ?, ?, 0, ?, ${rev}, ?, ?, 0 WHERE ${notSeeded}`
          )
          .bind(crypto.randomUUID(), uid, name, gid, g.type, icon, JSON.stringify(keywords), catOrder++, uid, now, now, uid)
      );
    }
  });
  stmts.push(db.prepare('UPDATE users SET seeded = 1 WHERE id = ?').bind(uid));

  const results = await db.batch(stmts);
  return { seeded: (results[1].meta.changes ?? 0) === 1 };
}
