import { useEffect, type ReactNode } from 'react';
import { useData } from '../lib/store';
import { monthLabel, shiftMonth, money, timeLabel } from '../lib/format';
import type { Transaction, TxType } from '../lib/types';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="monthpicker">
      <button className="btn sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label="เดือนก่อน">‹</button>
      <strong>{monthLabel(value)}</strong>
      <button className="btn sm" onClick={() => onChange(shiftMonth(value, 1))} aria-label="เดือนถัดไป">›</button>
    </div>
  );
}

export function TypeToggle({ value, onChange }: { value: TxType; onChange: (t: TxType) => void }) {
  return (
    <div className="seg">
      <button type="button" className={value === 'expense' ? 'on expense' : ''} onClick={() => onChange('expense')}>
        รายจ่าย
      </button>
      <button type="button" className={value === 'income' ? 'on income' : ''} onClick={() => onChange('income')}>
        รายรับ
      </button>
    </div>
  );
}

/** dropdown หมวดหมู่ จัดตามกลุ่ม */
export function CategorySelect({
  value,
  type,
  onChange,
  allowNone = true,
  allTypes = false
}: {
  value: string | null;
  type?: TxType;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  allTypes?: boolean;
}) {
  const { groups, categories } = useData();
  const gs = groups.filter((g) => allTypes || !type || g.type === type);
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">— ยังไม่จัดหมวด —</option>}
      {gs.map((g) => (
        <optgroup key={g.id} label={allTypes ? `${g.name} (${g.type === 'income' ? 'รายรับ' : 'รายจ่าย'})` : g.name}>
          {categories
            .filter((c) => c.groupId === g.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function AccountSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { accounts } = useData();
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— ไม่ระบุบัญชี —</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}

export function TxRow({ t, onClick }: { t: Transaction; onClick?: () => void }) {
  const { categoryById, accountById } = useData();
  const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
  const acc = t.accountId ? accountById.get(t.accountId) : undefined;
  const sub = [timeLabel(t.date), acc?.name, t.source === 'slip' ? `สลิป${t.bank ? ' ' + t.bank : ''}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <button className="tx" onClick={onClick}>
      <span className="emoji">{c?.icon ?? '❔'}</span>
      <span className="main">
        <div className="title">
          {c?.name ?? <span className="badge warn">ยังไม่จัดหมวด</span>}
          {t.note && <span className="muted small"> · {t.note}</span>}
        </div>
        <div className="sub">{sub}</div>
      </span>
      <span className={`amt ${t.type}`}>
        {t.type === 'income' ? '+' : '−'}
        {money(t.amount)}
      </span>
    </button>
  );
}

export function SyncBadge() {
  const { online, pendingWrites } = useData();
  if (!online)
    return <span className="sync offline" title="บันทึกไว้ในเครื่อง จะซิงก์เมื่อออนไลน์">ออฟไลน์</span>;
  if (pendingWrites) return <span className="sync pending">กำลังซิงก์…</span>;
  return <span className="sync">ซิงก์แล้ว</span>;
}
