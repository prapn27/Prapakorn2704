import Dexie, { type Table } from 'dexie';
import { DATA_SCHEMAS, type TableName } from '../../shared/schema';
import type { Account, Category, CategoryGroup, Transaction } from './types';

export interface OutboxItem {
  seq?: number;
  table: TableName;
  id: string;
  op: 'upsert' | 'delete';
  /** ข้อมูลทั้งแถว ณ เวลาที่แก้ (เฉพาะ upsert) */
  data?: Record<string, unknown>;
  clientUpdatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** ฐานข้อมูลในเครื่องของผู้ใช้หนึ่งคน — แหล่งข้อมูลหลักที่ UI อ่าน ส่วน server เป็นตัวซิงก์ระหว่างเครื่อง */
export class SlipDB extends Dexie {
  accounts!: Table<Account, string>;
  groups!: Table<CategoryGroup, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  /** การเปลี่ยนแปลงที่ยังไม่ได้ส่งขึ้น server (เรียงตาม seq) */
  outbox!: Table<OutboxItem, number>;
  /** rev: cursor ของการ sync · reloading: อยู่ระหว่างโหลดใหม่ทั้งหมด · bootstrapped */
  meta!: Table<MetaRow, string>;

  constructor(uid: string) {
    super(dbName(uid));
    this.version(1).stores({
      accounts: 'id, order',
      groups: 'id, order',
      categories: 'id, groupId, order',
      transactions: 'id, date, categoryId, accountId, slipRef',
      outbox: '++seq, table, id',
      meta: 'key'
    });
  }

  tableOf(name: TableName): Table<{ id: string }, string> {
    return this[name] as unknown as Table<{ id: string }, string>;
  }

  get dataTables() {
    return [this.accounts, this.groups, this.categories, this.transactions] as const;
  }
}

export const dbName = (uid: string) => `slipbudget-${uid}`;

/** เลือกเฉพาะฟิลด์ที่ server รับ (ใช้ schema เดียวกับ Worker) */
export function pickData(table: TableName, row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DATA_SCHEMAS[table].shape)) {
    const v = (row as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

let lastTs = 0;
/** เวลา (ms) ที่เพิ่มขึ้นเสมอ แม้แก้หลายครั้งในมิลลิวินาทีเดียวกัน — ใช้ตัดสิน last-write-wins */
export function nextTs(): number {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}

export function newId(): string {
  return crypto.randomUUID();
}
