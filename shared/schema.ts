import { z } from 'zod';

/** สัญญา (contract) ของ /api/sync ที่ client และ Worker ใช้ร่วมกัน */

export const TABLE_NAMES = ['accounts', 'groups', 'categories', 'transactions'] as const;
export type TableName = (typeof TABLE_NAMES)[number];

/** จำนวน mutation สูงสุดต่อ 1 request — จำกัดไว้เพราะ Workers แผนฟรีให้ใช้ query ได้ 50 ครั้งต่อ 1 invocation */
export const MAX_MUTATIONS = 30;

/** จำนวนแถวสูงสุดต่อตารางต่อ 1 response (ตัดหน้าเมื่อโหลดข้อมูลก้อนใหญ่) */
export const PAGE_SIZE = 2000;

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const txType = z.enum(['income', 'expense']);
const money = z.number().finite().min(-1e9).max(1e9);
const order = z.number().int().min(0).max(1_000_000);

export const accountData = z.object({
  name: z.string().trim().min(1).max(100),
  initialBalance: money,
  color: z.string().max(20),
  order
});

export const groupData = z.object({
  name: z.string().trim().min(1).max(100),
  type: txType,
  color: z.string().max(20),
  order
});

export const categoryData = z.object({
  name: z.string().trim().min(1).max(100),
  groupId: id,
  type: txType,
  icon: z.string().max(16),
  keywords: z.array(z.string().trim().min(1).max(60)).max(100),
  budget: z.number().finite().min(0).max(1e9).default(0),
  order
});

export const transactionData = z.object({
  type: txType,
  amount: z.number().finite().gt(0).lt(1e9),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  categoryId: id.nullable(),
  accountId: id.nullable(),
  note: z.string().max(500).default(''),
  source: z.enum(['manual', 'slip']),
  slipRef: z.string().min(1).max(200).nullable().default(null),
  bank: z.string().max(60).nullable().default(null),
  createdAt: z.number().int().nonnegative()
});

export const DATA_SCHEMAS = {
  accounts: accountData,
  groups: groupData,
  categories: categoryData,
  transactions: transactionData
} as const;

export const mutationSchema = z.object({
  table: z.enum(TABLE_NAMES),
  id,
  op: z.enum(['upsert', 'delete']),
  data: z.unknown().optional(),
  clientUpdatedAt: z.number().int().nonnegative()
});
export type Mutation = z.infer<typeof mutationSchema>;

export const syncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  mutations: z.array(mutationSchema).max(MAX_MUTATIONS)
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type RejectReason = 'duplicate_slip' | 'invalid';

export interface SyncResponse {
  /** เก็บไว้ใช้เป็น `since` ในครั้งถัดไป */
  rev: number;
  /** index ของ mutation (ใน request) ที่ server รับแล้ว (รวมที่แพ้ last-write-wins) → ลบออกจาก outbox ได้ */
  applied: number[];
  /** mutation ที่ server ไม่รับ → ลบออกจาก outbox และแจ้งผู้ใช้/แก้ข้อมูลในเครื่อง */
  rejected: { index: number; id: string; table: TableName; reason: RejectReason }[];
  /** true = client ต้องล้างข้อมูลในเครื่องแล้วใช้ `changes` เป็นข้อมูลทั้งหมด */
  full: boolean;
  /** true = ยังมีข้อมูลเหลือ (ตัดหน้า) → client ต้องเรียก sync ซ้ำทันทีโดยใช้ `rev` ที่ได้เป็น `since` */
  more: boolean;
  /** แถวที่ rev > since (รวมแถว deleted=true ยกเว้นตอนโหลดครั้งแรก/full) */
  changes: Record<TableName, WireRow[]>;
}

/** แถวที่ส่งให้ client — ชื่อฟิลด์เป็น camelCase เหมือน src/lib/types.ts บวกฟิลด์ของ sync */
export type WireRow = {
  id: string;
  rev: number;
  deleted: boolean;
  clientUpdatedAt: number;
} & Record<string, unknown>;
