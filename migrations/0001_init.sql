-- ผู้ใช้: rev คือตัวนับที่เพิ่มขึ้นทุกครั้งที่มีการเขียน ใช้เป็น cursor ของการ sync
-- purged_rev: rev สูงสุดของ tombstone ที่ถูกลบจริงแล้ว (เครื่องที่ sync ล่าสุดก่อนหน้านี้ต้องโหลดใหม่ทั้งหมด)
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  rev         INTEGER NOT NULL DEFAULT 0,
  purged_rev  INTEGER NOT NULL DEFAULT 0,
  seeded      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- คอลัมน์มาตรฐานทุกตาราง:
--   id                 UUID ที่ client สร้างเอง (สร้างรายการตอนออฟไลน์ได้)
--   rev                ค่า users.rev ตอนที่แถวนี้เปลี่ยนล่าสุด
--   client_updated_at  เวลา (ms) ที่แก้บนเครื่องผู้ใช้ ใช้ตัดสิน last-write-wins
--   server_updated_at  เวลา (ms) ฝั่ง server ใช้ตัดสินอายุ tombstone (ไม่เชื่อนาฬิกาเครื่องผู้ใช้)
--   deleted            soft delete เพื่อให้เครื่องอื่นรู้ว่าถูกลบ

CREATE TABLE accounts (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, initial_balance REAL NOT NULL DEFAULT 0, color TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, server_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE category_groups (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income','expense')), color TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, server_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE categories (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, group_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income','expense')),
  icon TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '[]',
  budget REAL NOT NULL DEFAULT 0, ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, server_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE transactions (
  id TEXT NOT NULL, user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  category_id TEXT, account_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual','slip')),
  slip_ref TEXT, bank TEXT,
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL, client_updated_at INTEGER NOT NULL, server_updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

-- index สำหรับ sync: ดึงเฉพาะแถวที่เปลี่ยนหลัง rev ที่เครื่องเคยเห็น (กัน full scan เพราะ D1 นับ rows read ตามแถวที่สแกน)
CREATE INDEX ix_accounts_rev     ON accounts (user_id, rev);
CREATE INDEX ix_groups_rev       ON category_groups (user_id, rev);
CREATE INDEX ix_categories_rev   ON categories (user_id, rev);
CREATE INDEX ix_transactions_rev ON transactions (user_id, rev);

-- index สำหรับ purge tombstone ประจำวัน
CREATE INDEX ix_accounts_del     ON accounts (deleted, server_updated_at) WHERE deleted = 1;
CREATE INDEX ix_groups_del       ON category_groups (deleted, server_updated_at) WHERE deleted = 1;
CREATE INDEX ix_categories_del   ON categories (deleted, server_updated_at) WHERE deleted = 1;
CREATE INDEX ix_transactions_del ON transactions (deleted, server_updated_at) WHERE deleted = 1;

-- กันสลิปซ้ำข้ามเครื่อง
CREATE UNIQUE INDEX ux_tx_slip ON transactions (user_id, slip_ref) WHERE slip_ref IS NOT NULL AND deleted = 0;
