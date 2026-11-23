import { env } from 'cloudflare:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_MUTATIONS, PAGE_SIZE, type SyncResponse, type TableName } from '../shared/schema';
import { createApp } from './index';
import { purgeTombstones } from './purge';
import { sync as runSync } from './sync';

const PROJECT = 'test-project';
const ISS = `https://securetoken.google.com/${PROJECT}`;

let signKey: CryptoKey;
let otherKey: CryptoKey;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const a = await generateKeyPair('RS256');
  const b = await generateKeyPair('RS256');
  signKey = a.privateKey;
  otherKey = b.privateKey;
  const jwk = { ...(await exportJWK(a.publicKey)), kid: 'k1', alg: 'RS256' } as JWK;
  app = createApp({ keys: createLocalJWKSet({ keys: [jwk] }) });
});

async function token(uid: string, opts: { key?: CryptoKey; aud?: string; exp?: string; iss?: string } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? PROJECT)
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? signKey);
}

async function call(uid: string, path: string, body?: unknown, method = 'POST') {
  return app.request(
    path,
    {
      method,
      headers: { Authorization: `Bearer ${await token(uid)}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    },
    env
  );
}

async function sync(uid: string, since = 0, mutations: unknown[] = [], reload?: boolean): Promise<SyncResponse> {
  const r = await call(uid, '/api/sync', { since, mutations, ...(reload ? { reload } : {}) });
  expect(r.status).toBe(200);
  return r.json();
}

// ---------- ตัวช่วยสร้างข้อมูล ----------
let n = 0;
const uid = () => `u${Date.now()}${++n}`; // ผู้ใช้ใหม่ทุกเทสต์
const id = (p: string, i: number) => `${p}-${String(i).padStart(6, '0')}`;

const txData = (over: Record<string, unknown> = {}) => ({
  type: 'expense',
  amount: 65,
  date: '2026-11-22T12:00',
  categoryId: null,
  accountId: null,
  note: 'ค่าข้าว',
  source: 'manual',
  slipRef: null,
  bank: null,
  createdAt: 1000,
  ...over
});
const up = (table: TableName, rid: string, data: unknown, t: number) => ({
  table, id: rid, op: 'upsert', data, clientUpdatedAt: t
});
const del = (table: TableName, rid: string, t: number) => ({ table, id: rid, op: 'delete', clientUpdatedAt: t });
const upTx = (rid: string, t: number, over: Record<string, unknown> = {}) => up('transactions', rid, txData(over), t);

describe('auth', () => {
  it('ไม่มี token → 401', async () => {
    const r = await app.request('/api/me', {}, env);
    expect(r.status).toBe(401);
  });

  it('token ที่ลงนามด้วยกุญแจอื่น → 401', async () => {
    const t = await token('u1', { key: otherKey });
    const r = await app.request('/api/me', { headers: { Authorization: `Bearer ${t}` } }, env);
    expect(r.status).toBe(401);
  });

  it('audience หรือ issuer ผิด / หมดอายุ → 401', async () => {
    for (const bad of [{ aud: 'other' }, { iss: 'https://securetoken.google.com/other' }, { exp: '-1h' }]) {
      const t = await token('u1', bad);
      const r = await app.request('/api/me', { headers: { Authorization: `Bearer ${t}` } }, env);
      expect(r.status).toBe(401);
    }
  });

  it('token ถูกต้อง → 200 และได้ uid', async () => {
    const u = uid();
    const r = await call(u, '/api/me', undefined, 'GET');
    expect(r.status).toBe(200);
    expect((await r.json<{ uid: string }>()).uid).toBe(u);
  });

  it('token ไม่มีลายเซ็นใช้ได้เฉพาะเมื่อ ENV=dev', async () => {
    const unsigned = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
      JSON.stringify({ iss: ISS, aud: PROJECT, sub: 'emu-user', exp: Math.floor(Date.now() / 1000) + 3600 })
    )}.`;
    const h = { headers: { Authorization: `Bearer ${unsigned}` } };
    expect((await app.request('/api/me', h, env)).status).toBe(401);
    expect((await app.request('/api/me', h, { ...env, ENV: 'dev' })).status).toBe(200);
  });
});

describe('bootstrap', () => {
  it('สร้างข้อมูลตั้งต้นครั้งเดียว แม้เรียกพร้อมกันหลายเครื่อง', async () => {
    const u = uid();
    const results = await Promise.all([1, 2, 3].map(() => call(u, '/api/bootstrap', {})));
    const seeded = await Promise.all(results.map(async (r) => (await r.json<{ seeded: boolean }>()).seeded));
    expect(seeded.filter(Boolean)).toHaveLength(1);

    const s = await sync(u);
    expect(s.changes.accounts).toHaveLength(2);
    expect(s.changes.groups).toHaveLength(7);
    expect(s.changes.categories).toHaveLength(21);
    const food = s.changes.categories.find((c) => c.name === 'อาหาร')!;
    expect(food.keywords).toContain('ค่าข้าว');
    expect(food.groupId).toBe(s.changes.groups.find((g) => g.name === 'กิน & ดื่ม')!.id);
    expect(food.deleted).toBe(false);
    expect(s.rev).toBe(1);
  });

  it('เรียกซ้ำภายหลังไม่สร้างเพิ่ม', async () => {
    const u = uid();
    await call(u, '/api/bootstrap', {});
    const again = await (await call(u, '/api/bootstrap', {})).json<{ seeded: boolean }>();
    expect(again.seeded).toBe(false);
    expect((await sync(u)).changes.categories).toHaveLength(21);
  });
});

describe('sync พื้นฐาน', () => {
  it('upsert แล้วดึงกลับมาได้ในรูป camelCase', async () => {
    const u = uid();
    const r = await sync(u, 0, [upTx(id('tx', 1), 10, { amount: 1250.5, note: 'grab' })]);
    expect(r.applied).toEqual([0]);
    expect(r.rejected).toEqual([]);
    expect(r.changes.transactions).toHaveLength(1);
    expect(r.changes.transactions[0]).toMatchObject({
      id: id('tx', 1), amount: 1250.5, note: 'grab', categoryId: null, slipRef: null,
      deleted: false, clientUpdatedAt: 10, rev: r.rev
    });
  });

  it('since ดึงเฉพาะที่เปลี่ยนหลังจากนั้น', async () => {
    const u = uid();
    const a = await sync(u, 0, [upTx(id('tx', 1), 10)]);
    const none = await sync(u, a.rev);
    expect(none.rev).toBe(a.rev);
    expect(Object.values(none.changes).flat()).toHaveLength(0);

    const b = await sync(u, a.rev, [upTx(id('tx', 2), 20)]);
    expect(b.rev).toBeGreaterThan(a.rev);
    expect(b.changes.transactions.map((t) => t.id)).toEqual([id('tx', 2)]);
  });

  it('ส่ง mutation เดิมซ้ำแล้วผลเท่าเดิม (idempotent)', async () => {
    const u = uid();
    const m = upTx(id('tx', 1), 10);
    await sync(u, 0, [m]);
    await sync(u, 0, [m]);
    const all = await sync(u, 0);
    expect(all.changes.transactions).toHaveLength(1);
  });

  it('แก้ไขรายการเดิมด้วยเวลาใหม่กว่า', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 10, { amount: 100 })]);
    const r = await sync(u, 0, [upTx(id('tx', 1), 20, { amount: 200 })]);
    expect(r.changes.transactions[0].amount).toBe(200);
  });

  it('ข้อมูลทุกตารางผ่านได้ (บัญชี/กลุ่ม/หมวด)', async () => {
    const u = uid();
    const r = await sync(u, 0, [
      up('accounts', id('acc', 1), { name: 'กสิกร', initialBalance: 500, color: '#fff', order: 1 }, 1),
      up('groups', id('grp', 1), { name: 'กิน', type: 'expense', color: '#f00', order: 1 }, 1),
      up('categories', id('cat', 1), {
        name: 'อาหาร', groupId: id('grp', 1), type: 'expense', icon: '🍚', keywords: ['ข้าว', 'ก๋วยเตี๋ยว'], budget: 3000, order: 1
      }, 1)
    ]);
    expect(r.applied).toEqual([0, 1, 2]);
    expect(r.changes.accounts[0]).toMatchObject({ name: 'กสิกร', initialBalance: 500, order: 1 });
    expect(r.changes.categories[0]).toMatchObject({ keywords: ['ข้าว', 'ก๋วยเตี๋ยว'], budget: 3000, groupId: id('grp', 1) });
  });
});

describe('last-write-wins', () => {
  it('การแก้ที่เก่ากว่าไม่ทับของใหม่ และ server ส่งแถวปัจจุบันกลับให้แก้ของในเครื่อง', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 100, { amount: 999, note: 'ใหม่' })]);
    const cur = await sync(u, 0);

    // เครื่องอื่นมี since ล่าสุดแล้ว แต่ยังมี mutation เก่าค้างใน outbox
    const r = await sync(u, cur.rev, [upTx(id('tx', 1), 50, { amount: 1, note: 'เก่า' })]);
    expect(r.applied).toEqual([0]); // ถือว่ารับแล้ว (ลบออกจาก outbox ได้)
    expect(r.changes.transactions).toHaveLength(1);
    expect(r.changes.transactions[0]).toMatchObject({ amount: 999, note: 'ใหม่' });

    const all = await sync(u, 0);
    expect(all.changes.transactions[0].amount).toBe(999);
  });
});

describe('ลบแบบ soft delete', () => {
  it('ส่ง tombstone ให้เครื่องอื่น แต่โหลดครั้งแรกไม่ส่ง', async () => {
    const u = uid();
    const a = await sync(u, 0, [upTx(id('tx', 1), 10), upTx(id('tx', 2), 10)]);
    const d = await sync(u, a.rev, [del('transactions', id('tx', 1), 20)]);
    expect(d.changes.transactions).toHaveLength(1);
    expect(d.changes.transactions[0]).toMatchObject({ id: id('tx', 1), deleted: true });

    const fresh = await sync(u, 0);
    expect(fresh.changes.transactions.map((t) => t.id)).toEqual([id('tx', 2)]);
  });

  it('คำสั่งลบที่เก่ากว่าการแก้ล่าสุดถูกเพิกเฉย', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 100)]);
    await sync(u, 0, [del('transactions', id('tx', 1), 50)]);
    expect((await sync(u, 0)).changes.transactions).toHaveLength(1);
  });

  it('upsert ที่ใหม่กว่าทำให้รายการที่ลบแล้วกลับมา', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 10), del('transactions', id('tx', 1), 20)]);
    expect((await sync(u, 0)).changes.transactions).toHaveLength(0);
    await sync(u, 0, [upTx(id('tx', 1), 30)]);
    expect((await sync(u, 0)).changes.transactions).toHaveLength(1);
  });
});

describe('กันสลิปซ้ำ', () => {
  it('คนละรายการแต่ slipRef เดียวกัน → reject duplicate_slip', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 10, { source: 'slip', slipRef: '014:AAA' })]);
    const r = await sync(u, 0, [upTx(id('tx', 2), 20, { source: 'slip', slipRef: '014:AAA' })]);
    expect(r.applied).toEqual([]);
    expect(r.rejected).toEqual([{ index: 0, id: id('tx', 2), table: 'transactions', reason: 'duplicate_slip' }]);
    expect((await sync(u, 0)).changes.transactions).toHaveLength(1);
  });

  it('แก้ไขรายการเดิมที่มี slipRef ได้ตามปกติ', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 10, { source: 'slip', slipRef: '014:AAA' })]);
    const r = await sync(u, 0, [upTx(id('tx', 1), 20, { source: 'slip', slipRef: '014:AAA', note: 'แก้' })]);
    expect(r.rejected).toEqual([]);
    expect(r.changes.transactions[0].note).toBe('แก้');
  });

  it('ซ้ำกันภายใน request เดียว → รับตัวแรก reject ตัวหลัง', async () => {
    const u = uid();
    const r = await sync(u, 0, [
      upTx(id('tx', 1), 10, { source: 'slip', slipRef: 'X' }),
      upTx(id('tx', 2), 10, { source: 'slip', slipRef: 'X' })
    ]);
    expect(r.applied).toEqual([0]);
    expect(r.rejected.map((x) => x.index)).toEqual([1]);
  });

  it('ลบรายการแล้วนำเข้าสลิปเดิมใหม่ได้ (แม้อยู่ใน request เดียวกัน)', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 10, { source: 'slip', slipRef: 'S1' })]);
    const r = await sync(u, 0, [
      del('transactions', id('tx', 1), 20),
      upTx(id('tx', 2), 21, { source: 'slip', slipRef: 'S1' })
    ]);
    expect(r.rejected).toEqual([]);
    const all = await sync(u, 0);
    expect(all.changes.transactions.map((t) => t.id)).toEqual([id('tx', 2)]);
  });

  it('สองเครื่องส่งสลิปเดียวกันพร้อมกันผ่าน HTTP → ได้แค่รายการเดียว ไม่เกิด 500', async () => {
    const u = uid();
    const rs = await Promise.all([
      call(u, '/api/sync', { since: 0, mutations: [upTx(id('tx', 1), 10, { source: 'slip', slipRef: 'RACE' })] }),
      call(u, '/api/sync', { since: 0, mutations: [upTx(id('tx', 2), 10, { source: 'slip', slipRef: 'RACE' })] })
    ]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(rs.map((r) => r.json<SyncResponse>()));
    expect(bodies.flatMap((b) => b.applied)).toHaveLength(1);
    expect(bodies.flatMap((b) => b.rejected.map((x) => x.reason))).toEqual(['duplicate_slip']);
    expect((await sync(u, 0)).changes.transactions).toHaveLength(1);
  });

  it('อีกเครื่องแทรกสลิปเดียวกันหลังตรวจซ้ำแต่ก่อนเขียน (race จริง) → batch ชน unique index แล้ววางแผนใหม่และ reject', async () => {
    const u = uid();
    let injected = 0;
    let batchCalls = 0;
    const racing = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'batch') return (stmts: D1PreparedStatement[]) => (batchCalls++, target.batch(stmts));
        if (prop === 'prepare') {
          return (q: string) => {
            const st = target.prepare(q);
            if (!q.includes('slip_ref IN')) return st;
            return {
              bind: (...a: unknown[]) => {
                const b = st.bind(...a);
                return {
                  all: async () => {
                    const r = await b.all();
                    if (!injected++) {
                      // เหมือนอีกเครื่องเขียนสำเร็จ: เพิ่ม rev ของผู้ใช้และแถวใหม่
                      await target.batch([
                        target.prepare('UPDATE users SET rev = 1 WHERE id = ?').bind(u),
                        target
                          .prepare(
                            `INSERT INTO transactions (id, user_id, type, amount, date, note, source, slip_ref, created_at, rev, client_updated_at, server_updated_at, deleted)
                             VALUES ('other-device', ?, 'expense', 10, '2026-11-01T00:00', '', 'slip', 'RACE2', 0, 1, 1, 1, 0)`
                          )
                          .bind(u)
                      ]);
                    }
                    return r;
                  }
                };
              }
            };
          };
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      }
    }) as unknown as D1Database;

    const r = await runSync(racing, u, {
      since: 0,
      mutations: [{ ...upTx(id('tx', 2), 10, { source: 'slip', slipRef: 'RACE2' }), op: 'upsert' as const }] as never
    });
    expect(injected).toBe(2); // ตรวจซ้ำสองรอบ = เข้าทางสำรองจริง
    expect(r.applied).toEqual([]);
    expect(r.rejected).toEqual([{ index: 0, id: id('tx', 2), table: 'transactions', reason: 'duplicate_slip' }]);
    expect((await sync(u, 0)).changes.transactions.map((t) => t.id)).toEqual(['other-device']);
  });

  it('ผู้ใช้คนละคนใช้ slipRef เดียวกันได้', async () => {
    const [a, b] = [uid(), uid()];
    await sync(a, 0, [upTx(id('tx', 1), 10, { source: 'slip', slipRef: 'S' })]);
    const r = await sync(b, 0, [upTx(id('tx', 1), 10, { source: 'slip', slipRef: 'S' })]);
    expect(r.rejected).toEqual([]);
  });
});

describe('การแยกข้อมูลผู้ใช้', () => {
  it('ผู้ใช้ B มองไม่เห็นข้อมูลของ A และเขียนทับไม่ได้', async () => {
    const [a, b] = [uid(), uid()];
    await sync(a, 0, [upTx(id('tx', 1), 10, { note: 'ของ A' })]);

    const seen = await sync(b, 0);
    expect(Object.values(seen.changes).flat()).toHaveLength(0);

    // B ใช้ id เดียวกับของ A → ต้องสร้างแถวของ B เอง ไม่แตะของ A
    await sync(b, 0, [upTx(id('tx', 1), 999, { note: 'ของ B' })]);
    expect((await sync(a, 0)).changes.transactions[0].note).toBe('ของ A');
    expect((await sync(b, 0)).changes.transactions[0].note).toBe('ของ B');
  });

  it('B ลบ id ของ A ไม่ได้', async () => {
    const [a, b] = [uid(), uid()];
    await sync(a, 0, [upTx(id('tx', 1), 10)]);
    await sync(b, 0, [del('transactions', id('tx', 1), 999)]);
    expect((await sync(a, 0)).changes.transactions).toHaveLength(1);
  });
});

describe('การตรวจข้อมูลขาเข้า', () => {
  it('mutation ที่ข้อมูลผิดถูก reject แต่ตัวอื่นใน request ยังผ่าน', async () => {
    const u = uid();
    const r = await sync(u, 0, [
      upTx(id('tx', 1), 10, { amount: -5 }),
      upTx(id('tx', 2), 10, { date: '22/11/2026' }),
      upTx(id('tx', 3), 10, { type: 'transfer' }),
      upTx(id('tx', 4), 10, { note: 'x'.repeat(501) }),
      upTx(id('tx', 5), 10)
    ]);
    expect(r.applied).toEqual([4]);
    expect(r.rejected.map((x) => [x.index, x.reason])).toEqual([[0, 'invalid'], [1, 'invalid'], [2, 'invalid'], [3, 'invalid']]);
    expect((await sync(u, 0)).changes.transactions.map((t) => t.id)).toEqual([id('tx', 5)]);
  });

  it('โครงสร้าง request ผิด → 400', async () => {
    const u = uid();
    const bad = [
      { since: -1, mutations: [] },
      { since: 0, mutations: [{ table: 'users', id: 'abcdefgh', op: 'upsert', clientUpdatedAt: 1 }] },
      { since: 0, mutations: [{ table: 'accounts', id: "x'; DROP TABLE users;--", op: 'delete', clientUpdatedAt: 1 }] },
      { since: 0 },
      { since: 0, mutations: Array.from({ length: MAX_MUTATIONS + 1 }, (_, i) => del('accounts', id('a', i), 1)) }
    ];
    for (const body of bad) expect((await call(u, '/api/sync', body)).status).toBe(400);
  });

  it('JSON เสียหรือ body ใหญ่เกิน → 400 / 413', async () => {
    const u = uid();
    const t = await token(u);
    const headers = { Authorization: `Bearer ${t}` };
    expect((await app.request('/api/sync', { method: 'POST', headers, body: '{oops' }, env)).status).toBe(400);
    const huge = JSON.stringify({ since: 0, mutations: [], pad: 'x'.repeat(600 * 1024) });
    expect((await app.request('/api/sync', { method: 'POST', headers, body: huge }, env)).status).toBe(413);
  });
});

describe('purge และโหลดใหม่ทั้งหมด', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('ลบ tombstone เก่า แล้วเครื่องที่ตามไม่ทันต้อง full reload', async () => {
    const u = uid();
    const a = await sync(u, 0, [upTx(id('tx', 1), 10), upTx(id('tx', 2), 10)]);
    const d = await sync(u, a.rev, [del('transactions', id('tx', 1), 20)]);

    // ยังไม่ถึง 90 วัน → ไม่ลบ
    expect(await purgeTombstones(env.DB, Date.now() + 10 * DAY)).toBe(0);

    const purged = await purgeTombstones(env.DB, Date.now() + 100 * DAY);
    expect(purged).toBeGreaterThanOrEqual(1);

    // เครื่องที่ sync ไว้ก่อนการลบ (since = a.rev < d.rev = purged_rev) → full
    const stale = await sync(u, a.rev);
    expect(stale.full).toBe(true);
    expect(stale.changes.transactions.map((t) => t.id)).toEqual([id('tx', 2)]);

    // เครื่องที่ตามทันแล้ว → ปกติ
    const fresh = await sync(u, d.rev);
    expect(fresh.full).toBe(false);
  });

  it('since ล้ำหน้า server (DB ถูกรีเซ็ต) → full', async () => {
    const u = uid();
    await sync(u, 0, [upTx(id('tx', 1), 10)]);
    const r = await sync(u, 9999);
    expect(r.full).toBe(true);
    expect(r.changes.transactions).toHaveLength(1);
  });

  it('full reload ที่ข้อมูลเกิน 1 หน้า ต้องจบได้ (ไม่วนได้ full ซ้ำ) และได้ข้อมูลครบรวม tombstone ที่เกิดระหว่างทาง', async () => {
    const u = uid();
    const total = PAGE_SIZE + 50;
    await env.DB.prepare('INSERT INTO users (id, rev, purged_rev, seeded, created_at) VALUES (?, ?, ?, 1, 0)').bind(u, total, total).run();
    await env.DB
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
         INSERT INTO transactions (id, user_id, type, amount, date, note, source, created_at, rev, client_updated_at, server_updated_at, deleted)
         SELECT 'bulk-' || printf('%06d', i), ?, 'expense', 10, '2026-11-01T00:00', '', 'manual', 0, i, 1, 1, 0 FROM n`
      )
      .bind(total, u)
      .run();

    // เครื่องเก่า (since=5 < purged_rev) → หน้าแรกบอก full และตัดหน้า cursor ยังต่ำกว่า purged_rev
    const first = await sync(u, 5);
    expect(first.full).toBe(true);
    expect(first.more).toBe(true);
    expect(first.rev).toBeLessThan(total);

    // ถ้าไม่ส่ง reload จะได้ full ซ้ำ (พฤติกรรมที่ทำให้วนไม่จบ) — ส่ง reload แล้วต้องไม่ใช่
    expect((await sync(u, first.rev)).full).toBe(true);
    const seen = new Set(first.changes.transactions.map((t) => t.id));
    let since = first.rev;
    for (let i = 0; i < 5; i++) {
      const r = await sync(u, since, [], true);
      expect(r.full).toBe(false);
      r.changes.transactions.forEach((t) => seen.add(t.id));
      since = r.rev;
      if (!r.more) break;
    }
    expect(seen.size).toBe(total);
  });

  it('full reload ยังรับ mutation ที่ค้างอยู่ใน outbox', async () => {
    const u = uid();
    const a = await sync(u, 0, [upTx(id('tx', 1), 10)]);
    await sync(u, a.rev, [del('transactions', id('tx', 1), 20)]);
    await purgeTombstones(env.DB, Date.now() + 100 * DAY);
    const r = await sync(u, a.rev, [upTx(id('tx', 2), 30)]);
    expect(r.full).toBe(true);
    expect(r.applied).toEqual([0]);
    expect(r.changes.transactions.map((t) => t.id)).toEqual([id('tx', 2)]);
  });
});

describe('ตัดหน้า (pagination)', () => {
  it('ข้อมูลเกิน PAGE_SIZE ต้องวน sync จนครบโดยไม่ตกหล่น', async () => {
    const u = uid();
    const total = PAGE_SIZE + 150;
    await env.DB.prepare('INSERT INTO users (id, rev, purged_rev, seeded, created_at) VALUES (?, ?, 0, 1, 0)').bind(u, total).run();
    await env.DB
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
         INSERT INTO transactions (id, user_id, type, amount, date, note, source, created_at, rev, client_updated_at, server_updated_at, deleted)
         SELECT 'bulk-' || printf('%06d', i), ?, 'expense', 10, '2026-11-01T00:00', '', 'manual', 0, i, 1, 1, 0 FROM n`
      )
      .bind(total, u)
      .run();

    const seen = new Set<string>();
    let since = 0;
    let pages = 0;
    for (;;) {
      const r = await sync(u, since);
      r.changes.transactions.forEach((t) => seen.add(t.id));
      pages++;
      expect(r.rev).toBeGreaterThan(since);
      since = r.rev;
      if (!r.more) break;
      expect(pages).toBeLessThan(10);
    }
    expect(seen.size).toBe(total);
    expect(pages).toBe(2);
  });
});

describe('ประสิทธิภาพและโควตา D1', () => {
  it('query หลักใช้ index ทั้งหมด (ไม่ full scan → ไม่กิน rows read)', async () => {
    const plan = async (sql: string, ...args: unknown[]) =>
      (await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...args).all<{ detail: string }>()).results.map((r) => r.detail).join(' | ');

    for (const t of ['accounts', 'category_groups', 'categories', 'transactions']) {
      const d = await plan(`SELECT * FROM ${t} WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT 10`, 'u', 0);
      expect(d, t).toMatch(/USING (COVERING )?INDEX/);
      expect(d, t).not.toMatch(/SCAN/);
    }
    const slip = await plan(
      `SELECT id, slip_ref FROM transactions WHERE user_id = ? AND deleted = 0 AND slip_ref IN (?, ?)`, 'u', 'a', 'b'
    );
    expect(slip).toMatch(/ux_tx_slip/);
    expect(slip).not.toMatch(/SCAN/);
  });

  it('1 request (สูงสุด 30 mutation รวมสลิปและแพ้ LWW) ใช้ query ไม่เกิน 50 ครั้ง', async () => {
    const u = uid();
    const seedMuts = Array.from({ length: MAX_MUTATIONS }, (_, i) =>
      upTx(id('tx', i), 1000, { source: 'slip', slipRef: `ref-${i}` })
    );
    await sync(u, 0, seedMuts);
    const cur = await sync(u, 0);

    let prepared = 0;
    const counting = new Proxy(env.DB, {
      get(target, prop, recv) {
        if (prop === 'prepare') return (q: string) => (prepared++, target.prepare(q));
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      }
    });
    // ทุก mutation แพ้ LWW (เก่ากว่า) จึงต้องมี query ดึงแถวปัจจุบันกลับเพิ่ม — เป็นกรณีที่แพงที่สุด
    const stale = seedMuts.map((m, i) => upTx(id('tx', i), 5, { source: 'slip', slipRef: `ref-${i}` }));
    const r = await app.request(
      '/api/sync',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token(u)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ since: cur.rev, mutations: stale })
      },
      { ...env, DB: counting }
    );
    expect(r.status).toBe(200);
    expect(prepared).toBeLessThanOrEqual(50);
  });
});
