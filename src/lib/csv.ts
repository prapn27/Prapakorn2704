import type { Account, Category, CategoryGroup, Transaction } from './types';
import { displayName, tr } from './i18n';

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
  const header = [tr('วันที่'), tr('เวลา'), tr('ประเภท'), tr('จำนวนเงิน'), tr('กลุ่ม'), tr('หมวด'), tr('บัญชี'), 'note', tr('ที่มา'), tr('ธนาคาร')];
  const rows = txs.map((t) => {
    const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    const g = c ? groupById.get(c.groupId) : undefined;
    return [
      t.date.slice(0, 10),
      t.date.slice(11, 16),
      t.type === 'income' ? tr('รายรับ') : tr('รายจ่าย'),
      t.amount.toFixed(2),
      g?.name ?? '',
      c ? displayName(c.name) : tr('ยังไม่จัดหมวด'),
      (t.accountId && accountById.get(t.accountId)?.name) || '',
      t.note,
      t.source === 'slip' ? tr('สลิป') : tr('กรอกเอง'),
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
