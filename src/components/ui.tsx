import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../lib/store';
import { displayYear, monthKey, monthLabel, monthNamesShort, parseYearInput, shiftMonth, money, timeLabel } from '../lib/format';
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

/** ตัวเลือกเดือน: ลูกศรเลื่อนทีละเดือน · แตะชื่อเดือนเพื่อเปิดป็อปอัพเลือกเดือน/ปี (กรอกปีเองได้) */
export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const { tt } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="monthpicker">
      <button className="btn sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label={tt('เดือนก่อน')}>‹</button>
      <button className="monthlabel" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={tt('เลือกเดือนและปี')}>
        {monthLabel(value)} <span aria-hidden="true">▾</span>
      </button>
      <button className="btn sm" onClick={() => onChange(shiftMonth(value, 1))} aria-label={tt('เดือนถัดไป')}>›</button>
      {open && (
        <MonthYearSheet
          value={value}
          onPick={(m) => {
            onChange(m);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function MonthYearSheet({ value, onPick, onClose }: { value: string; onPick: (m: string) => void; onClose: () => void }) {
  const { tt } = useI18n();
  const [selY, selM] = value.split('-').map(Number);
  const [year, setYear] = useState(selY);
  const [text, setText] = useState(String(displayYear(selY)));
  const [now] = useState(() => monthKey(new Date()));
  const [nowY, nowM] = now.split('-').map(Number);
  const names = monthNamesShort();
  const inputRef = useRef<HTMLInputElement>(null);

  const setYearBoth = (y: number) => {
    setYear(y);
    setText(String(displayYear(y)));
  };
  const onText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setText(digits);
    const y = parseYearInput(digits);
    if (y) setYear(y); // พิมพ์ครบ 4 หลักถึงจะเปลี่ยนปี
  };
  const valid = parseYearInput(text) !== null;

  return (
    <Sheet title={tt('เลือกเดือนและปี')} onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setYearBoth(Math.max(1900, year - 1))} aria-label={tt('ปีก่อน')}>‹</button>
          <input
            ref={inputRef}
            className="input yearinput"
            inputMode="numeric"
            value={text}
            aria-label={tt('ปี')}
            aria-invalid={!valid}
            onChange={(e) => onText(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === 'Enter' && valid && onPick(`${year}-${String(selM).padStart(2, '0')}`)}
          />
          <button type="button" className="btn" onClick={() => setYearBoth(Math.min(2200, year + 1))} aria-label={tt('ปีถัดไป')}>›</button>
        </div>
        {!valid && <div className="small danger-text" style={{ textAlign: 'center' }}>{tt('กรอกปี 4 หลัก')}</div>}
        <div className="monthgrid" role="group" aria-label={tt('เลือกเดือน')}>
          {names.map((n, i) => (
            <button
              type="button"
              key={n}
              disabled={!valid}
              className={`monthcell${year === selY && i + 1 === selM ? ' on' : ''}${year === nowY && i + 1 === nowM ? ' now' : ''}`}
              onClick={() => onPick(`${year}-${String(i + 1).padStart(2, '0')}`)}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="button" className="btn block" onClick={() => onPick(now)}>{tt('ไปที่เดือนนี้')}</button>
      </div>
    </Sheet>
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
  onToggle,
  onLongPress
}: {
  t: Transaction;
  onClick?: () => void;
  /** โหมดเลือกหลายรายการ: แสดงช่องติ๊ก และแตะทั้งแถวเพื่อติ๊ก */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** กดค้าง ~0.5 วินาทีที่แถว (ใช้เข้าโหมดเลือกหลายรายการ) */
  onLongPress?: () => void;
}) {
  const { tt } = useI18n();
  const pressTimer = useRef(0);
  const pressFired = useRef(false);
  const startPress = () => {
    if (!onLongPress) return;
    pressFired.current = false;
    pressTimer.current = window.setTimeout(() => {
      pressFired.current = true;
      onLongPress();
    }, 500);
  };
  const endPress = () => clearTimeout(pressTimer.current);
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
    <button
      className="tx"
      onClick={() => {
        if (pressFired.current) {
          pressFired.current = false; // คลิกที่ตามหลังการกดค้าง ไม่ต้องเปิดฟอร์มแก้ไข
          return;
        }
        onClick?.();
      }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
    >
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
