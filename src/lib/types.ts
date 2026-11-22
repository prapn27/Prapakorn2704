export type TxType = 'income' | 'expense';

export interface Account {
  id: string;
  name: string;
  initialBalance: number;
  color: string;
  order: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  type: TxType;
  color: string;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  groupId: string;
  type: TxType;
  icon: string;
  /** คำที่ใช้จับคู่กับ note บนสลิป */
  keywords: string[];
  /** งบประมาณต่อเดือน (บาท) — 0 หรือไม่มี = ไม่ตั้งงบ */
  budget?: number;
  order: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  /** รูปแบบ YYYY-MM-DDTHH:mm (เวลาท้องถิ่น) เพื่อเรียง/กรองด้วย string ได้ */
  date: string;
  categoryId: string | null;
  accountId: string | null;
  note: string;
  source: 'manual' | 'slip';
  /** ข้อความใน QR บนสลิป ใช้กันนำเข้าซ้ำ */
  slipRef?: string | null;
  bank?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export type NewTransaction = Omit<Transaction, 'id'>;
