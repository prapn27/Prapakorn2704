# แผนย้ายฐานข้อมูล: Firebase → Cloudflare D1 + Workers

> สถานะ: **Phase 1 (backend) เสร็จแล้ว** — ดูหัวข้อ 12 · **Phase 2 (client) ยังไม่ได้เริ่ม** โค้ดฝั่งแอพยังใช้ Firestore อยู่
> ตัดสินใจแล้ว: ใช้ **auth ทาง A** (Firebase Authentication เฉพาะส่วนล็อกอิน) และคงระบบล็อกอินเดิมไว้
> เขียนไว้ให้ session ถัดไปหยิบไปทำต่อได้ทันที โดยไม่ต้องย้อนอ่านบทสนทนาเดิม

---

## 0. บริบทสำหรับ session ถัดไป

### ความต้องการของเจ้าของงาน (ตกลงกันแล้ว)
- เว็บแอพ (PWA) บันทึกรายรับรายจ่าย ภาษาไทยและเงินบาทอย่างเดียว
- **ผู้ใช้คนเดียว ใช้หลายเครื่องพร้อมกัน** และข้อมูลต้องซิงก์กัน
- **ต้องใช้ตอนไม่มีเน็ตได้** แล้วซิงก์ให้เมื่อกลับมาออนไลน์
- ใส่ข้อมูลได้ 2 ทาง: กรอกเอง และนำเข้าจากรูปสลิปโอนเงิน โดยใช้ **note บนสลิป** มาจับคู่หมวด
- OCR ทำในเครื่องผู้ใช้ **รูปสลิปทิ้งทันที** ไม่อัปโหลดและไม่เก็บ
- ผู้ใช้จัดการหมวดหมู่ กลุ่ม และกฎจับคู่ (keyword) เองผ่านหน้าหลังบ้านในแอพ
- **เหตุผลที่ย้าย:** กังวลโควตาฟรีของ Firestore (อ่านได้ 50,000 ครั้งต่อวัน) เจ้าของงานเลือกตัวเลือก Cloudflare D1 + Workers

### สิ่งที่ทำเสร็จแล้ว (commit `2472f40`)
- แอพครบทุกหน้า: หน้าหลัก, รายการ, นำเข้าสลิป, รายงาน, ตั้งค่า, หลังบ้านจัดการหมวด, บัญชี, ล็อกอิน
- ทดสอบ end-to-end กับ Firebase Emulator ผ่านทั้งหมด: สมัครสมาชิก, กรอกเอง, นำเข้าสลิป 3 ใบ, กันสลิปซ้ำ, บันทึกตอนออฟไลน์แล้วซิงก์
- Unit test 15 ข้อ (`src/lib/slipParser.test.ts`) ผ่านทั้งหมด
- **ยังไม่ได้ deploy** ยังไม่มีโปรเจกต์ Firebase จริง และยังไม่มีผู้ใช้จริง → **ไม่ต้องย้ายข้อมูลเก่า**

### ไฟล์ที่เกี่ยวกับการย้าย

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/store.tsx` | **เขียนใหม่ข้างใน แต่คง interface `DataApi` เดิมไว้** หน้าจอทุกหน้าใช้ `useData()` ผ่าน interface นี้อย่างเดียว |
| `src/lib/firebase.ts` | ลบ แล้วแทนด้วย `src/lib/auth.ts` + `src/lib/api.ts` |
| `src/pages/Login.tsx`, `src/pages/Settings.tsx` (ปุ่มออกจากระบบ), `src/pages/SetupNeeded.tsx` | แก้ให้ใช้ auth แบบใหม่ |
| `src/lib/defaults.ts` | ย้ายการสร้างหมวดตั้งต้นไปไว้ฝั่ง server (ดูหัวข้อ 5) |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.env.emulator`, devDependency `firebase-tools` | ลบ |
| `.github/workflows/deploy.yml` | เปลี่ยนจาก GitHub Pages เป็น deploy ขึ้น Cloudflare |
| ส่วนที่ **ไม่ต้องแตะ:** `slipParser.ts`, `categorize.ts`, `ocr.ts`, `stats.ts`, `csv.ts`, `format.ts`, components และ pages อื่นทั้งหมด | |

---

## 1. สถาปัตยกรรมใหม่

```
┌──────────────── มือถือ / คอม (PWA) ────────────────┐
│  React UI ── useData() ── store.tsx                 │
│                    │                                │
│        IndexedDB (Dexie): ข้อมูลทั้งหมด + outbox     │ ← ใช้ออฟไลน์ได้เต็มที่
│                    │  sync engine                   │
└────────────────────┼────────────────────────────────┘
                     │ HTTPS  POST /api/sync (ส่ง outbox + ดึงสิ่งที่เปลี่ยน)
┌────────────────────┼──── Cloudflare (โดเมนเดียวกัน) ─┐
│  Worker (Hono) ── ตรวจ token ── D1 (SQLite)          │
│  Static Assets: ไฟล์แอพจาก dist/                      │
└─────────────────────────────────────────────────────┘
```

- **Worker ตัวเดียวทำทั้งสองหน้าที่:** เสิร์ฟไฟล์แอพ (Workers Static Assets) และ `/api/*` ทั้งหมดอยู่ origin เดียวกัน จึงไม่ต้องตั้ง CORS
- **ไม่ใช้ GitHub Pages อีกต่อไป:** Cloudflare รองรับ repo แบบ private ฟรี
- **แหล่งข้อมูลหลักของ UI คือ IndexedDB ในเครื่อง** UI อ่านและเขียนที่เครื่องก่อนเสมอ แล้ว sync engine ค่อยส่งขึ้นและดึงลงเบื้องหลัง

### โควตาฟรีของ Cloudflare (ประมาณการ ต้องเช็ก https://developers.cloudflare.com/d1/platform/pricing/ อีกครั้งก่อนเริ่ม)

| รายการ | ฟรีต่อวัน | ประมาณการใช้งานจริง (1 คน) |
|---|---|---|
| Workers requests | ~100,000 | sync ทุก 60 วินาทีขณะเปิดแอพ 2 ชั่วโมง ≈ 120 + ตอนเปิดหรือบันทึก ≈ **< 500** |
| D1 rows read | ~5,000,000 | ดึงด้วย index `(user_id, rev)` อ่านเฉพาะแถวที่เปลี่ยน ≈ **< 2,000** |
| D1 rows written | ~100,000 | ≈ **< 100** |
| D1 storage | ~500 MB ต่อฐานข้อมูล / 5 GB ต่อบัญชี | 1 รายการ ≈ 300 bytes → ~1.5 ล้านรายการ |

> ⚠ D1 นับ "rows read" จากจำนวนแถวที่ query **สแกน** ไม่ใช่จำนวนแถวที่ส่งกลับ ทุก query ต้องใช้ index ห้าม full scan

---

## 2. การล็อกอิน — ต้องตัดสินใจก่อนเริ่ม

| ทาง | วิธี | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **A (แนะนำ)** | ใช้ **Firebase Authentication เฉพาะส่วนล็อกอิน** แล้ว Worker ตรวจ ID token ด้วย `jose` กับ JWKS ของ Google | ได้ Google login + อีเมล/รหัสผ่านเหมือนเดิม, หน้า Login แทบไม่ต้องแก้, Auth ฟรีและ **ไม่เกี่ยวกับโควตา Firestore** | ยังพึ่ง Firebase (แต่เฉพาะส่วน Auth) |
| B | **Cloudflare Access** (Zero Trust) ครอบทั้งแอพ | แทบไม่ต้องเขียนโค้ด auth | เหมาะกับใช้คนเดียว, cookie ของ Access หมดอายุแล้วอาจทำให้ PWA ออฟไลน์สะดุด และเพิ่มผู้ใช้ยุ่งกว่า |
| C | เขียน auth เองใน Worker: อีเมล/รหัสผ่าน (PBKDF2 ผ่าน WebCrypto) + session token และ Google OAuth เอง | ไม่พึ่งใครเลย | งานเยอะที่สุด และต้องดูแลความปลอดภัยเอง (reset รหัสผ่านต้องมีระบบส่งอีเมล) |

**ข้อเสนอ:** เริ่มด้วย **A** ถ้าภายหลังอยากตัด Firebase ทิ้งทั้งหมดค่อยทำ C เพราะ Worker แค่ต้องการ `user_id` ที่เชื่อถือได้ การเปลี่ยนวิธีล็อกอินจึงไม่กระทบส่วนอื่น

### รายละเอียดทาง A
- ฝั่ง client: เหลือแค่ `firebase/auth` (ลบ `firebase/firestore`) ทำให้ bundle เล็กลงมาก
- ทุก request แนบ `Authorization: Bearer <idToken>` โดยใช้ `user.getIdToken()` ซึ่งต่ออายุ token ให้เอง
- ฝั่ง Worker: `jwtVerify(token, createRemoteJWKSet('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), { issuer: 'https://securetoken.google.com/<PROJECT_ID>', audience: '<PROJECT_ID>' })` → `sub` คือ `user_id`
- **ตอนออฟไลน์:** Firebase Auth จำ user ไว้ในเครื่อง แอพเปิดได้และอ่านเขียน IndexedDB ได้ตามปกติ แค่ sync จะรอจนกว่าจะออนไลน์

---

## 3. Schema ของ D1

ไฟล์ `migrations/0001_init.sql`

```sql
-- ผู้ใช้: rev คือตัวนับเพิ่มขึ้นเรื่อย ๆ ใช้เป็น cursor ของการ sync
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- uid จาก auth
  rev         INTEGER NOT NULL DEFAULT 0,
  seeded      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- คอลัมน์มาตรฐานทุกตาราง:
--   id                 TEXT  (UUID ที่ client สร้าง เพื่อให้สร้างรายการตอนออฟไลน์ได้)
--   user_id            TEXT
--   rev                INTEGER  (ค่า users.rev ตอนที่แถวนี้เปลี่ยนล่าสุด)
--   client_updated_at  INTEGER  (ms จากเครื่องที่แก้ ใช้ตัดสินเมื่อแก้ชนกัน)
--   deleted            INTEGER 0/1  (soft delete เพื่อให้เครื่องอื่นรู้ว่ารายการถูกลบ)

CREATE TABLE accounts (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, initial_balance REAL NOT NULL DEFAULT 0, color TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE category_groups (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income','expense')), color TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE categories (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, group_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income','expense')),
  icon TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '[]',   -- JSON array
  budget REAL NOT NULL DEFAULT 0, ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE transactions (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,                     -- 'YYYY-MM-DDTHH:mm'
  category_id TEXT, account_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual','slip')),
  slip_ref TEXT, bank TEXT,
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

-- index สำหรับ sync (ดึงเฉพาะที่เปลี่ยนหลัง rev ที่เครื่องเคยเห็น)
CREATE INDEX ix_accounts_rev     ON accounts (user_id, rev);
CREATE INDEX ix_groups_rev       ON category_groups (user_id, rev);
CREATE INDEX ix_categories_rev   ON categories (user_id, rev);
CREATE INDEX ix_transactions_rev ON transactions (user_id, rev);

-- กันสลิปซ้ำข้ามเครื่อง (เช่นสองเครื่องนำเข้าสลิปเดียวกันตอนออฟไลน์)
CREATE UNIQUE INDEX ux_tx_slip ON transactions (user_id, slip_ref) WHERE slip_ref IS NOT NULL AND deleted = 0;
```

- ชื่อคอลัมน์ใน DB เป็น `snake_case` ส่วน client ใช้ `camelCase` ตาม `src/lib/types.ts` ให้แปลงที่ชั้น API
- `ord` ใช้แทน `order` เพราะ `order` เป็นคำสงวนของ SQL

---

## 4. โปรโตคอล sync

### Endpoint เดียว: `POST /api/sync`

ส่งขึ้นและดึงลงใน request เดียว เพื่อประหยัดจำนวน request

```jsonc
// request
{
  "since": 1234,                 // rev ล่าสุดที่เครื่องนี้เคยได้รับ (0 = ครั้งแรก)
  "mutations": [                 // จาก outbox เรียงตามลำดับที่เกิด สูงสุด 500 รายการต่อครั้ง
    { "table": "transactions", "id": "uuid", "op": "upsert",
      "data": { "type": "expense", "amount": 65, "date": "2026-11-22T12:00", ... },
      "clientUpdatedAt": 1763800000000 },
    { "table": "categories", "id": "uuid", "op": "delete", "clientUpdatedAt": 1763800000500 }
  ]
}
// response
{
  "rev": 1240,                   // เก็บไว้ใช้เป็น since ครั้งถัดไป
  "applied": ["uuid", ...],      // mutation ที่ server รับแล้ว → ลบออกจาก outbox
  "rejected": [ { "id": "uuid", "reason": "duplicate_slip" } ],
  "changes": {                   // ทุกแถว (รวมแถวที่ deleted=1) ที่ rev > since
    "accounts": [...], "groups": [...], "categories": [...], "transactions": [...]
  },
  "full": false                  // true = client ต้องล้างข้อมูลในเครื่องแล้วโหลดใหม่ทั้งหมด (ดูหัวข้อ tombstone)
}
```

### ลำดับการทำงานฝั่ง server (ใช้ `db.batch()` ให้เป็น transaction เดียว)
1. ตรวจ token → ได้ `user_id` แล้วตรวจข้อมูลทุก mutation ด้วย `zod` (ประเภท, ความยาว note ≤ 500, amount > 0 ฯลฯ)
2. `UPDATE users SET rev = rev + 1 WHERE id = ? RETURNING rev` → ได้ `newRev` (ทุกแถวที่เปลี่ยนใน request นี้ใช้ rev เดียวกัน)
3. แต่ละ mutation:
   ```sql
   INSERT INTO <table> (...) VALUES (...)
   ON CONFLICT (user_id, id) DO UPDATE SET ...
   WHERE excluded.client_updated_at >= <table>.client_updated_at   -- last-write-wins ตามเวลาที่แก้จริง
   ```
   ถ้าการลบเป็นแบบ `op: delete` ให้ `SET deleted = 1` ไม่ลบจริง
4. ถ้าชน `ux_tx_slip` (สลิปซ้ำ) ให้ใส่ไว้ใน `rejected` แล้ว client จะลบรายการนั้นในเครื่องพร้อมแจ้งผู้ใช้
5. ดึง `changes`: `SELECT * FROM <table> WHERE user_id = ? AND rev > ?` ทั้ง 4 ตาราง (ใช้ index)

> **หมายเหตุ:** D1 batch เป็น transaction เดียวก็จริง แต่ข้อ 4 ต้องรู้ว่า statement ไหนชน ให้แยก insert สลิปที่มี `slip_ref` ออกมาเช็กก่อนด้วย `SELECT 1 ... WHERE slip_ref = ?` หรือใช้ `INSERT ... ON CONFLICT DO NOTHING RETURNING id` แล้วดูว่าได้แถวกลับมาหรือไม่

### เมื่อไหร่ที่ client sync
- ตอนเปิดแอพ, ตอนเกิด event `online`, ตอน `visibilitychange` กลับมาที่แอพ
- หลังเขียนข้อมูล 1.5 วินาที (debounce ไม่ให้ยิงทุกครั้งที่พิมพ์)
- ทุก 60 วินาทีขณะแอพอยู่บนหน้าจอ (เพื่อให้เห็นข้อมูลจากเครื่องอื่น)
- ถ้า sync ล้มเหลว ให้ลองใหม่แบบ backoff: 5, 15, 60 วินาที จนถึงสูงสุด 5 นาที

> Firestore ซิงก์แบบ real-time ทันที ส่วนแผนนี้จะช้ากว่าได้ถึงประมาณ 60 วินาที ถ้าต้องการ real-time จริงค่อยเพิ่ม **Durable Objects + WebSocket** ทีหลัง (ดูหัวข้อ 9)

### Tombstone (แถวที่ deleted=1)
- Cron Worker วันละครั้ง: ลบจริงแถวที่ `deleted = 1` และเปลี่ยนแปลงเกิน 90 วัน แล้วบันทึก `users.purged_rev` (เพิ่มคอลัมน์นี้)
- ถ้า client ส่ง `since < purged_rev` (เครื่องที่หายไปนานกว่า 90 วัน) ให้ตอบ `full: true` พร้อมข้อมูลทั้งหมด แล้ว client ล้าง IndexedDB และโหลดใหม่ **แต่ต้องส่ง outbox ที่ค้างอยู่ก่อนเสมอ**

---

## 5. ข้อมูลตั้งต้น (หมวด, กลุ่ม, บัญชี)

- `POST /api/bootstrap` เรียกครั้งแรกหลังล็อกอิน server เช็ก `users.seeded` แล้วสร้างหมวดตั้งต้นจาก `defaults.ts` (ย้ายไฟล์ไปไว้ที่ `shared/` ให้ทั้ง Worker และ client import ได้) **ทำที่ server เพื่อกันสองเครื่องสร้างหมวดซ้ำกัน**
- ถ้าตอน bootstrap ยังออฟไลน์อยู่ (เกิดได้ยาก เพราะล็อกอินครั้งแรกต้องออนไลน์) ให้แสดงหน้า "ต่ออินเทอร์เน็ตเพื่อตั้งค่าครั้งแรก"

---

## 6. ฝั่ง client

### ไฟล์ใหม่
- `src/lib/localdb.ts` — Dexie:
  ```ts
  db.version(1).stores({
    accounts: 'id, ord', groups: 'id, ord', categories: 'id, groupId, ord',
    transactions: 'id, date, categoryId, accountId, slipRef',
    outbox: '++seq, table, id',          // mutation ที่ยังไม่ได้ส่ง
    meta: 'key'                          // { key: 'rev', value }, { key: 'uid', value }
  });
  ```
  **ต้องแยกฐานข้อมูลตามผู้ใช้** (`slipbudget-<uid>`) และลบทิ้งเมื่อออกจากระบบ
- `src/lib/sync.ts` — sync engine: อ่าน outbox → `POST /api/sync` → apply `changes` ลง Dexie (แถวที่ `deleted=1` ให้ลบในเครื่อง) → ลบ `applied` ออกจาก outbox → บันทึก rev ทั้งหมดใน Dexie transaction เดียว
  - **ข้อควรระวัง:** ถ้าแถวไหนยังมี mutation ค้างใน outbox อย่าเอา `changes` จาก server มาทับ เพราะการแก้ในเครื่องใหม่กว่า
- `src/lib/api.ts` — `fetch` + แนบ token + timeout 15 วินาที
- `src/lib/auth.ts` — ห่อ Firebase Auth (ทาง A) ให้ส่วนอื่นไม่ต้องรู้ว่าใช้ Firebase

### `store.tsx` (คง `DataApi` เดิมไว้ทุกฟังก์ชัน)
- อ่าน: ใช้ `useLiveQuery` จาก `dexie-react-hooks` แทน `onSnapshot`
- เขียน: เขียน Dexie และเพิ่มลง outbox ใน Dexie transaction เดียว แล้ว `scheduleSync()` UI อัปเดตทันทีผ่าน live query
- `pendingWrites` = outbox ไม่ว่าง ทำให้ `SyncBadge` ใช้งานได้เหมือนเดิม
- `deleteCategory` / `deleteAccount`: ตั้ง `categoryId`/`accountId` ของรายการที่เกี่ยวข้องเป็น null แล้วใส่ outbox ด้วย (เหมือนที่ทำกับ Firestore batch ตอนนี้)
- กันสลิปซ้ำในเครื่องทำเหมือนเดิม (เช็กใน IndexedDB) ส่วน server กันซ้ำข้ามเครื่องอีกชั้น

### PWA
- เพิ่ม `navigateFallback` และ `navigateFallbackDenylist: [/^\/api\//]` ใน workbox ไม่ให้ service worker แคช API
- ขอ `navigator.storage.persist()` หลังล็อกอิน กันเบราว์เซอร์ลบ IndexedDB (สำคัญกว่าตอนใช้ Firestore เพราะตอนนี้ข้อมูลที่ยังไม่ได้ส่งอยู่ในเครื่องที่เดียว)

---

## 7. โครงสร้าง repo หลังย้าย

```
/
├─ src/                      # client (เดิม)
├─ shared/                   # types.ts, defaults.ts, schema (zod) ที่ใช้ทั้งสองฝั่ง
├─ worker/
│  ├─ index.ts               # Hono app: /api/sync, /api/bootstrap, /api/me + cron purge
│  ├─ auth.ts                # ตรวจ token
│  ├─ sync.ts
│  └─ sync.test.ts           # @cloudflare/vitest-pool-workers
├─ migrations/0001_init.sql
├─ wrangler.jsonc
└─ .github/workflows/deploy.yml
```

`wrangler.jsonc` (โครงคร่าว ๆ):
```jsonc
{
  "name": "slip-budget",
  "main": "worker/index.ts",
  "compatibility_date": "<วันที่ตอนเริ่มทำ>",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [{ "binding": "DB", "database_name": "slip-budget", "database_id": "<จาก wrangler d1 create>" }],
  "vars": { "FIREBASE_PROJECT_ID": "<project id>" },
  "triggers": { "crons": ["17 19 * * *"] }   // purge tombstone (ตี 2 เวลาไทย)
}
```

### การพัฒนาในเครื่อง
- `wrangler dev` ใช้ D1 จำลองในเครื่อง (Miniflare) ไม่กินโควตาจริง
- ตั้ง Vite proxy `/api` → `http://127.0.0.1:8787`
- ทาง A ยังใช้ Firebase Auth Emulator ตอน dev ได้ แต่ Worker ต้องมีโหมด dev ที่ตรวจ token ของ emulator ซึ่งไม่มีลายเซ็น (เปิดเฉพาะตอน `ENV=dev` เท่านั้น)

---

## 8. ลำดับงาน (checklist)

**Phase 1 — Backend** ✅ เสร็จแล้ว (เทสต์ 34 ข้อผ่าน และลองกับ `wrangler dev` จริงแล้ว)
- [x] ติดตั้ง `wrangler`, `hono`, `jose`, `zod`, `@cloudflare/vitest-plugin` (ชื่อใหม่ของ `vitest-pool-workers`)
- [x] `migrations/0001_init.sql` + `wrangler.jsonc`
- [x] `worker/auth.ts` (ทาง A) พร้อมโหมด dev
- [x] `/api/bootstrap`, `/api/sync`, `/api/me`
- [x] Test: upsert, LWW, soft delete, สลิปซ้ำ (รวมกรณีแข่งกันจริง), `since`, แยกผู้ใช้, validation, query plan ใช้ index, จำนวน query ต่อ request
- [x] cron purge + `full: true`

**Phase 2 — Client**
- [ ] `localdb.ts`, `api.ts`, `auth.ts`, `sync.ts`
- [ ] เขียน `store.tsx` ใหม่โดยคง `DataApi` เดิม
- [ ] แก้ Login, Settings และหน้า "ยังไม่ได้ตั้งค่า"
- [ ] ลบ `firebase/firestore`, `firebase.json`, `firestore.*`, `.env.emulator` และ `firebase-tools` ออกจาก devDependencies
- [ ] workbox denylist `/api/` + `storage.persist()`

**Phase 3 — ทดสอบ end-to-end** (ใช้ Playwright และสลิปจำลองแบบเดิม ดูหัวข้อ 11)
- [ ] สมัครสมาชิกแล้วได้หมวดตั้งต้น **ชุดเดียว** แม้เปิด 2 แท็บพร้อมกัน
- [ ] กรอกเองแล้วจับคู่หมวดอัตโนมัติ
- [ ] นำเข้าสลิป 3 ใบ แล้วนำเข้าซ้ำต้องถูกเตือน
- [ ] **2 browser context (จำลอง 2 เครื่อง):** เครื่อง A บันทึก แล้วเครื่อง B เห็นภายใน 60 วินาที
- [ ] เครื่อง A ออฟไลน์แล้วบันทึก 3 รายการ + ลบ 1 รายการ → กลับมาออนไลน์ → เครื่อง B เห็นถูกต้อง
- [ ] แก้รายการเดียวกันจาก 2 เครื่องตอนออฟไลน์ → การแก้ที่ใหม่กว่าต้องชนะ
- [ ] นำเข้าสลิปเดียวกันจาก 2 เครื่องตอนออฟไลน์ → เหลือ 1 รายการ และอีกเครื่องได้รับแจ้ง
- [ ] ปิดแล้วเปิดแอพตอนออฟไลน์ ข้อมูลยังอยู่ครบ

**Phase 4 — Deploy**
- [ ] GitHub Actions: `npm ci` → `npm test` → `npm run build` → `wrangler d1 migrations apply slip-budget --remote` → `wrangler deploy` (ใช้ `cloudflare/wrangler-action`)
- [ ] อัปเดต README (ตั้งค่า Cloudflare แทน GitHub Pages)

---

## 9. ทำทีหลังได้ (ไม่อยู่ในขอบเขตตอนนี้)
- Real-time ผ่าน Durable Objects + WebSocket: ส่งสัญญาณว่า "มีข้อมูลใหม่" แล้วให้ client เรียก `/api/sync` ทันที แทนการรอรอบ 60 วินาที
- Auth แบบ C เพื่อตัด Firebase ทิ้งทั้งหมด
- Export/Import backup เป็น JSON จาก IndexedDB
- ปรับ `slipParser.ts` รายธนาคาร เมื่อได้ตัวอย่างสลิปจริงจากเจ้าของงาน (ทำแยกจากการย้ายฐานข้อมูลได้เลย)

---

## 10. สิ่งที่เจ้าของงานต้องเตรียม
1. **บัญชี Cloudflare** (ฟรี)
2. **API Token:** สร้างที่ My Profile → API Tokens → Create Token → Custom โดยให้สิทธิ์ `Account · Workers Scripts · Edit`, `Account · D1 · Edit` แล้วใส่เป็น GitHub Secret ชื่อ `CLOUDFLARE_API_TOKEN` และใส่ `CLOUDFLARE_ACCOUNT_ID` คู่กัน
3. **ถ้าเลือกทาง A:** โปรเจกต์ Firebase ที่เปิดแค่ **Authentication** (Google + Email/Password) ไม่ต้องสร้าง Firestore, เพิ่มโดเมน `*.workers.dev` หรือโดเมนจริงใน Authorized domains แล้วใส่ค่า config เป็น GitHub Variables `VITE_FIREBASE_*` (ใช้แค่ `API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`)
4. **(ไม่บังคับ)** โดเมนของตัวเอง ถ้าไม่มีจะได้ `slip-budget.<subdomain>.workers.dev`

---

## 11. ความเสี่ยงและข้อควรระวัง

| ความเสี่ยง | การรับมือ |
|---|---|
| sync engine เขียนเองมีบั๊ก ข้อมูลหายหรือซ้ำ | ใช้ UUID จาก client + upsert ที่ทำซ้ำได้ผลเหมือนเดิม (ส่ง mutation เดิมซ้ำต้องไม่เกิดผลเพิ่ม) และมี test ครบตาม Phase 3 |
| เบราว์เซอร์ลบ IndexedDB ขณะที่ outbox ยังไม่ได้ส่ง | `storage.persist()`, sync ถี่หลังเขียน และแนะนำให้ติดตั้งเป็น PWA (สำคัญมากบน iOS) |
| นาฬิกาของเครื่องผู้ใช้เพี้ยน ทำให้ LWW ผิด | ยอมรับได้สำหรับผู้ใช้คนเดียว ถ้าต้องการเข้มขึ้นให้เปลี่ยนเป็น version ต่อแถว (optimistic concurrency) |
| query สแกนเยอะจนกิน rows read | ทุก query ต้องมี `user_id` + index และใช้ `EXPLAIN QUERY PLAN` ตรวจใน test |
| ข้อจำกัด D1 (ขนาด statement, จำนวน bind parameter ต่อ query) | จำกัด 500 mutation ต่อ request แล้วแบ่ง batch และ client วนส่งจน outbox ว่าง |

### หมายเหตุการทดสอบจาก session เดิม
- container ของ session เดิม **บล็อก CDN** (jsdelivr, tessdata) จึงเปลี่ยนไปเก็บไฟล์ OCR ไว้กับแอพ (`scripts/copy-ocr-assets.mjs` → `public/ocr/`) ทำให้ Worker Static Assets เสิร์ฟไฟล์ OCR ได้เลย แต่ต้องเช็กขนาดไฟล์: Workers Assets จำกัดไฟล์ละ 25 MB ส่วนไฟล์ใหญ่สุดของเราคือ `tesseract-core-*.wasm.js` ประมาณ 4 MB จึงไม่มีปัญหา
- สลิปจำลองสร้างด้วย Playwright + `qrcode` (HTML ฟอนต์ Loma) โดยใช้ QR รูปแบบ TLV `00 41 [00 06 000001][01 03 <รหัสธนาคาร>][02 xx <เลขอ้างอิง>] 51 02 TH 91 04 xxxx`
- ตอนนั้นใช้ Firebase Emulator บน `127.0.0.1` เพราะ `localhost` resolve เป็น `::1` แล้วต่อไม่ได้ใน container


---

## 12. สถานะ Phase 1 และสิ่งที่ต่างจากแผนเดิม

### ไฟล์ที่เพิ่ม
```
shared/schema.ts       สัญญา /api/sync (zod) ใช้ร่วมกับ client ใน Phase 2 — MAX_MUTATIONS, PAGE_SIZE, ชนิดของ response
shared/defaults.ts     หมวด/กลุ่ม/บัญชีตั้งต้น (src/lib/defaults.ts re-export จากที่นี่)
worker/index.ts        Hono app (+ cron) · createApp({ keys }) ฉีดกุญแจตอนเทสต์ได้
worker/auth.ts         ตรวจ Firebase ID token (RS256 + issuer + audience) · ENV=dev ยอมรับ token ไม่มีลายเซ็นของ emulator
worker/sync.ts         โปรโตคอล sync · worker/bootstrap.ts · worker/purge.ts · worker/tables.ts
worker/sync.test.ts    เทสต์ (รันใน workerd + D1 จำลอง)
migrations/0001_init.sql · wrangler.jsonc · .dev.vars.example · vitest.config.ts · worker/vitest.config.ts
```

### สิ่งที่ต่างจากข้อความด้านบน (Phase 2 ต้องยึดตามนี้)

| หัวข้อ | แผนเดิม | ที่ทำจริง | เหตุผล |
|---|---|---|---|
| `applied` ใน response | รายการ id | **`number[]` = index ของ mutation ใน request** และมี `rejected[].index` | outbox อาจมีหลาย mutation ของ id เดียวกัน (สร้างแล้วแก้) จึงใช้ id แยกไม่ได้ |
| จำนวน mutation ต่อ request | 500 | **30** (`MAX_MUTATIONS`) | Workers แผนฟรีใช้ได้ **50 query ต่อ 1 invocation** (เช็กค่าล่าสุดที่หน้าราคา) ทดสอบแล้วว่ากรณีแย่สุดใช้ ≤ 50 → client ต้องวนส่งจน outbox ว่าง |
| ตัดหน้า | ไม่มี | response มี **`more`**: ถ้า true ให้เรียก sync ซ้ำทันทีด้วย `rev` ที่ได้เป็น `since` | โหลดข้อมูลก้อนใหญ่ครั้งแรก (จำกัด 2,000 แถวต่อตาราง) |
| อายุ tombstone | ใช้ `client_updated_at` | เพิ่มคอลัมน์ **`server_updated_at`** | ไม่เชื่อนาฬิกาเครื่องผู้ใช้ ไม่งั้นเครื่องที่นาฬิกาเพี้ยนทำให้การลบถูก purge เร็วเกินไป |
| mutation ที่แพ้ LWW | ไม่ได้ระบุ | นับเป็น `applied` และ **ส่งแถวปัจจุบันของ server กลับใน `changes` ด้วย** แม้ rev ต่ำกว่า `since` | ไม่งั้นเครื่องที่ข้าม `changes` เพราะมี mutation ค้าง จะไม่มีทางได้ค่าล่าสุด |
| `full` | `since < purged_rev` | เพิ่ม **`since > users.rev`** (DB ถูกรีเซ็ต) | ป้องกันเครื่องที่ล้ำหน้า server |
| consistency | — | ทั้งเขียน อ่าน และเพิ่ม rev อยู่ใน `db.batch()` เดียว | กันกรณีสองเครื่อง sync พร้อมกันแล้วเครื่องหนึ่งได้ cursor ข้ามแถวที่ยังไม่ commit |

### สิ่งที่ client (Phase 2) ต้องทำตามสัญญา
1. ส่ง mutation จาก outbox ทีละ ≤ 30 รายการ เรียงตามลำดับที่เกิด
2. ลบจาก outbox: ทุก index ใน `applied` และ `rejected` (`rejected` ให้แจ้งผู้ใช้/แก้ข้อมูลในเครื่อง เช่น `duplicate_slip` → ลบรายการที่นำเข้าซ้ำ)
3. ถ้า `full: true` → ล้างตารางข้อมูลในเครื่อง (ไม่ล้าง outbox) แล้วใช้ `changes` เป็นข้อมูลทั้งหมด
4. apply `changes`: แถว `deleted: true` ให้ลบในเครื่อง · **อย่าทับแถวที่ยังมี mutation ค้างใน outbox** ยกเว้นแถวที่มาจาก mutation ที่แพ้ LWW ซึ่งอยู่ใน request เดียวกัน (ให้ลบ mutation นั้นออกจาก outbox ก่อนแล้วค่อย apply)
5. ถ้า `more: true` ให้เรียกซ้ำทันที · เก็บ `rev` เป็น `since` ครั้งถัดไปหลัง apply เสร็จใน Dexie transaction เดียวกัน
6. ถ้าถูก 401 ให้ขอ token ใหม่ (`getIdToken(true)`) แล้วลองอีกครั้ง ถ้ายังไม่ได้ให้ถือว่าออกจากระบบ

### ข้อควรรู้เรื่องเครื่องมือ
- `@cloudflare/vitest-pool-workers` ถูกยกเลิกและเปลี่ยนชื่อเป็น **`@cloudflare/vitest-plugin`** ต้องใช้ **vitest ≥ 4.1** (อัปเกรดแล้ว เทสต์ฝั่ง client เดิมผ่านครบ)
- **npm 10 ในเครื่อง/สภาพแวดล้อมนี้ติดตั้งไม่ผ่าน** (บั๊ก arborist `edgesOut` ตอนแก้ dependency tree) แก้ด้วย `npx -y npm@11 install` เมื่อต้องเพิ่มหรือเปลี่ยนแพ็กเกจ ส่วน `npm ci` ด้วย npm 10 จาก lockfile ใช้ได้ปกติ (ตรวจแล้ว) จึงไม่กระทบ CI
- npm 11 ไม่รัน install script ของแพ็กเกจอัตโนมัติ (esbuild, workerd) แต่ทุกอย่างใช้งานได้ ไม่ต้อง approve
- `database_id` และ `FIREBASE_PROJECT_ID` ใน `wrangler.jsonc` เป็นค่าตัวอย่าง **ต้องแก้เป็นของจริงก่อน deploy** (Phase 4)
- ลองรันในเครื่อง: `cp .dev.vars.example .dev.vars` → `npm run db:migrate:local` → `npm run build` → `npm run dev:worker` แล้วเปิด http://127.0.0.1:8787
- ยังไม่ได้ทดสอบกับ Cloudflare จริง (D1 จริง, ตรวจ token ด้วย JWKS ของ Google จริง) — ต้องทำตอน Phase 4 หลังมีบัญชี Cloudflare และโปรเจกต์ Firebase
