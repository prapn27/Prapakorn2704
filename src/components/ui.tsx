import { useEffect, type ReactNode } from 'react';
import { useData } from '../lib/store';
import { monthLabel, shiftMonth, money, timeLabel } from '../lib/format';
import type { Transaction, TxType } from '../lib/types';
import { displayName, useI18n } from '../lib/i18n';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { tt } = useI18n();
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
          <button className="icon-btn" onClick={onClose} aria-label={tt('ปิด')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const { tt } = useI18n();
  return (
    <div className="monthpicker">
      <button className="btn sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label={tt('เดือนก่อน')}>‹</button>
      <strong>{monthLabel(value)}</strong>
      <button className="btn sm" onClick={() => onChange(shiftMonth(value, 1))} aria-label={tt('เดือนถัดไป')}>›</button>
    </div>
  );
}

export function TypeToggle({ value, onChange }: { value: TxType; onChange: (t: TxType) => void }) {
  const { tt } = useI18n();
  return (
    <div className="seg">
      <button type="button" className={value === 'expense' ? 'on expense' : ''} onClick={() => onChange('expense')}>
        {tt('รายจ่าย')}
      </button>
      <button type="button" className={value === 'income' ? 'on income' : ''} onClick={() => onChange('income')}>
        {tt('รายรับ')}
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
  const { tt } = useI18n();
  const { groups, categories } = useData();
  const gs = groups.filter((g) => allTypes || !type || g.type === type);
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">{tt('— ยังไม่จัดหมวด —')}</option>}
      {gs.map((g) => (
        <optgroup key={g.id} label={allTypes ? `${displayName(g.name)} (${g.type === 'income' ? tt('รายรับ') : tt('รายจ่าย')})` : displayName(g.name)}>
          {categories
            .filter((c) => c.groupId === g.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {displayName(c.name)}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function AccountSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { tt } = useI18n();
  const { accounts } = useData();
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{tt('— ไม่ระบุบัญชี —')}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{displayName(a.name)}</option>
      ))}
    </select>
  );
}

export function TxRow({
  t,
  onClick,
  selectable,
  selected,
  onToggle
}: {
  t: Transaction;
  onClick?: () => void;
  /** โหมดเลือกหลายรายการ: แสดงช่องติ๊ก และแตะทั้งแถวเพื่อติ๊ก */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { tt } = useI18n();
  const { categoryById, accountById } = useData();
  const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
  const acc = t.accountId ? accountById.get(t.accountId) : undefined;
  const sub = [timeLabel(t.date), acc && displayName(acc.name), t.source === 'slip' ? tt('สลิป') + (t.bank ? ' ' + displayName(t.bank) : '') : null]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <span className="emoji">{c?.icon ?? '❔'}</span>
      <span className="main">
        <div className="title">
          {c ? displayName(c.name) : <span className="badge warn">{tt('ยังไม่จัดหมวด')}</span>}
          {t.note && <span className="muted small"> · {t.note}</span>}
        </div>
        <div className="sub">{sub}</div>
      </span>
      <span className={`amt ${t.type}`}>
        {t.type === 'income' ? '+' : '−'}
        {money(t.amount)}
      </span>
    </>
  );
  if (selectable) {
    return (
      <label className={`tx selectable${selected ? ' selected' : ''}`}>
        <input type="checkbox" checked={Boolean(selected)} onChange={() => onToggle?.()} aria-label={tt('เลือกรายการนี้')} />
        {body}
      </label>
    );
  }
  return (
    <button className="tx" onClick={onClick}>
      {body}
    </button>
  );
}

/** สวิตช์ภาษา ไทย / English (ชื่อภาษาแสดงเป็นภาษาของตัวเองเสมอ) */
export function LanguageSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="seg" role="group" aria-label="Language">
      <button type="button" className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>ไทย</button>{/* i18n-skip */}
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
    </div>
  );
}

export function SyncBadge() {
  const { tt } = useI18n();
  const { online, pendingWrites, syncing, syncError, retrySync } = useData();
  if (!online)
    return (
      <span className="sync offline" title={tt('บันทึกไว้ในเครื่อง จะซิงก์เมื่อออนไลน์')}>
        {tt('ออฟไลน์')}{pendingWrites ? tt(' · รอซิงก์') : ''}
      </span>
    );
  if (syncError && !syncing)
    return (
      <button className="sync pending" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={retrySync} title={syncError}>
        {tt('ซิงก์ไม่สำเร็จ · ลองใหม่')}
      </button>
    );
  if (syncing || pendingWrites) return <span className="sync pending">{tt('กำลังซิงก์…')}</span>;
  return <span className="sync">{tt('ซิงก์แล้ว')}</span>;
}
