import type { Account, Category, CategoryGroup, Transaction } from './types';

const esc = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(
  txs: Transaction[],
  categoryById: Map<string, Category>,
  groupById: Map<string, CategoryGroup>,
  accountById: Map<string, Account>,
  filename: string
) {
  const header = ['วันที่', 'เวลา', 'ประเภท', 'จำนวนเงิน', 'กลุ่ม', 'หมวด', 'บัญชี', 'note', 'ที่มา', 'ธนาคาร'];
  const rows = txs.map((t) => {
    const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    const g = c ? groupById.get(c.groupId) : undefined;
    return [
      t.date.slice(0, 10),
      t.date.slice(11, 16),
      t.type === 'income' ? 'รายรับ' : 'รายจ่าย',
      t.amount.toFixed(2),
      g?.name ?? '',
      c?.name ?? 'ยังไม่จัดหมวด',
      (t.accountId && accountById.get(t.accountId)?.name) || '',
      t.note,
      t.source === 'slip' ? 'สลิป' : 'กรอกเอง',
      t.bank ?? ''
    ].map(esc);
  });
  // BOM ทำให้ Excel อ่านภาษาไทยถูก
  const csv = '﻿' + [header.map(esc), ...rows].map((r) => r.join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
