import { useState } from 'react';
import { useData } from '../lib/store';
import { matchCategory } from '../lib/categorize';
import { parseAmount, toLocalDateTime } from '../lib/format';
import type { Transaction, TxType } from '../lib/types';
import { AccountSelect, CategorySelect, Sheet, TypeToggle } from './ui';
import { useI18n } from '../lib/i18n';

export function TransactionForm({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const { tt } = useI18n();
  const data = useData();
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
  const [date, setDate] = useState(tx?.date ?? toLocalDateTime(new Date()));
  const [note, setNote] = useState(tx?.note ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(tx?.accountId ?? data.accounts[0]?.id ?? null);
  const [manualCat, setManualCat] = useState(Boolean(tx?.categoryId));

  const onNote = (v: string) => {
    setNote(v);
    if (manualCat) return;
    const m = matchCategory(v, data.categories, type);
    setCategoryId(m?.category.id ?? null);
    if (m) setType(m.category.type);
  };

  const onType = (t: TxType) => {
    setType(t);
    const c = categoryId ? data.categoryById.get(categoryId) : undefined;
    if (c && c.type !== t) setCategoryId(null);
  };

  const amt = parseAmount(amount);
  const valid = amt > 0 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const payload = { type, amount: amt, date, note: note.trim(), categoryId, accountId };
    if (tx) data.updateTransaction(tx.id, payload);
    else data.addTransaction({ ...payload, source: 'manual', slipRef: null, bank: null });
    onClose();
  };

  const remove = () => {
    if (tx) {
      data.deleteTransaction(tx.id); // ไม่ถามยืนยัน — มีปุ่มเลิกทำแสดงที่มุมล่างจอแทน
      onClose();
    }
  };

  return (
    <Sheet title={tx ? tt('แก้ไขรายการ') : tt('เพิ่มรายการ')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <TypeToggle value={type} onChange={onType} />
        <label className="field">
          <span>{tt('จำนวนเงิน (บาท)')}</span>
          <input
            className="input amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            autoFocus={!tx}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </label>
        <label className="field">
          <span>{tt('note / รายละเอียด')}</span>
          <input className="input" value={note} placeholder={tt('เช่น ค่าข้าว, grab')} onChange={(e) => onNote(e.target.value)} />
        </label>
        <label className="field">
          <span>
            {tt('หมวดหมู่')} {!manualCat && categoryId && <span className="badge ok">{tt('จับคู่อัตโนมัติ')}</span>}
          </span>
          <CategorySelect
            value={categoryId}
            type={type}
            onChange={(id) => {
              setCategoryId(id);
              setManualCat(Boolean(id));
            }}
          />
        </label>
        <div className="grid2">
          <label className="field">
            <span>{tt('วันเวลา')}</span>
            <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>{tt('บัญชี')}</span>
            <AccountSelect value={accountId} onChange={setAccountId} />
          </label>
        </div>
        <button className="btn primary block" disabled={!valid}>{tt('บันทึก')}</button>
        {tx && (
          <button type="button" className="btn danger block" onClick={remove}>{tt('ลบรายการ')}</button>
        )}
      </form>
    </Sheet>
  );
}
