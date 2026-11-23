import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../lib/store';
import { dateLabel, money, monthKey } from '../lib/format';
import { normalizeText } from '../lib/categorize';
import { totals } from '../lib/stats';
import { useReapplyRules } from '../lib/useReapply';
import { AccountSelect, MonthPicker, TxRow } from '../components/ui';
import { TransactionForm } from '../components/TransactionForm';
import type { Transaction } from '../lib/types';
import { displayName, useI18n } from '../lib/i18n';

export default function Transactions() {
  const { tt, lang } = useI18n();
  const data = useData();
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const [month, setMonth] = useState<string | null>(cat === 'none' ? null : monthKey(new Date()));
  const [type, setType] = useState<'' | 'income' | 'expense'>('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Transaction | null>(null);
  const reapply = useReapplyRules();

  // ---------- เลือกหลายรายการเพื่อลบ ----------
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allRef = useRef<HTMLInputElement>(null);
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  useEffect(() => {
    if (!selecting) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && exitSelect();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [selecting]);

  const setCat = (v: string) => {
    if (v) params.set('cat', v);
    else params.delete('cat');
    setParams(params, { replace: true });
  };

  const list = useMemo(() => {
    const nq = normalizeText(q);
    return data.transactions.filter((t) => {
      if (month && !t.date.startsWith(month)) return false;
      if (type && t.type !== type) return false;
      if (accountId && t.accountId !== accountId) return false;
      if (cat === 'none' && t.categoryId) return false;
      if (cat && cat !== 'none' && t.categoryId !== cat) return false;
      if (nq) {
        const c = t.categoryId ? displayName(data.categoryById.get(t.categoryId)?.name ?? '') : '';
        if (!normalizeText(`${t.note} ${c} ${t.amount}`).includes(nq)) return false;
      }
      return true;
    });
  }, [data.transactions, data.categoryById, month, type, accountId, cat, q, lang]);

  const byDay = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of list) {
      const d = t.date.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(t);
    }
    return [...m.entries()];
  }, [list]);

  const sum = totals(list);

  // นับเฉพาะรายการที่ "มองเห็นอยู่" ตามตัวกรองตอนนี้ — เปลี่ยนตัวกรองแล้วรายการที่ซ่อนไปจะไม่ถูกลบโดยไม่รู้ตัว
  const picked = useMemo(() => list.filter((t) => selected.has(t.id)), [list, selected]);
  const allSelected = list.length > 0 && picked.length === list.length;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = picked.length > 0 && !allSelected;
  }, [picked.length, allSelected, selecting]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  const bulkDelete = () => {
    if (!picked.length) return;
    const s = totals(picked);
    const msg =
      tt('ลบ {n} รายการที่เลือก?', { n: picked.length }) +
      '\n' +
      tt('รายรับ +{inc} · รายจ่าย −{exp}', { inc: money(s.income), exp: money(s.expense) }) +
      '\n' +
      tt('ลบแล้วย้อนกลับไม่ได้');
    if (!confirm(msg)) return;
    data.deleteTransactions(picked.map((t) => t.id));
    exitSelect();
  };

  return (
    <div className="page" style={selecting ? { paddingBottom: 84 } : undefined}>
      <div className="pagebar">
        <div className="grow">
          {month ? (
            <MonthPicker value={month} onChange={setMonth} />
          ) : (
            <div className="row">
              <strong>{tt('ทุกเดือน')}</strong>
              <span className="spacer" />
              <button className="btn sm" onClick={() => setMonth(monthKey(new Date()))}>{tt('เลือกเดือน')}</button>
            </div>
          )}
        </div>
        {list.length > 0 && !selecting && (
          <button className="btn sm" onClick={() => setSelecting(true)} title={tt('เลือกหลายรายการเพื่อลบ (กดค้างที่รายการก็ได้)')}>
            {tt('☑ เลือก')}
          </button>
        )}
      </div>
      <div className="card stack">
        <input className="input" placeholder={tt('🔍 ค้นหา note / หมวด / ยอด')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="">{tt('ทุกประเภท')}</option>
            <option value="expense">{tt('รายจ่าย')}</option>
            <option value="income">{tt('รายรับ')}</option>
          </select>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{tt('ทุกหมวด')}</option>
            <option value="none">{tt('❔ ยังไม่จัดหมวด')}</option>
            {data.groups.map((g) => (
              <optgroup key={g.id} label={displayName(g.name)}>
                {data.categories
                  .filter((c) => c.groupId === g.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {displayName(c.name)}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="spacer"><AccountSelect value={accountId} onChange={setAccountId} /></div>
          {month && (
            <button className="btn sm ghost" onClick={() => setMonth(null)}>{tt('ทุกเดือน')}</button>
          )}
        </div>
        <div className="row small">
          <span className="muted">{tt('{n} รายการ', { n: list.length })}</span>
          <span className="spacer" />
          <span className="income">+{money(sum.income)}</span>
          <span className="expense">−{money(sum.expense)}</span>
        </div>
        {list.length > 0 && selecting && (
            <div className="row">
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  ref={allRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setMany(list.map((t) => t.id), !allSelected)}
                  style={{ width: 20, height: 20 }}
                />
                <strong>{tt('เลือกทั้งหมด ({n})', { n: list.length })}</strong>
              </label>
              <span className="spacer" />
              <button className="btn sm" onClick={exitSelect}>{tt('ยกเลิก')}</button>
            </div>
        )}
        {cat === 'none' && list.length > 0 && (
          <button className="btn sm" onClick={reapply}>{tt('⚡ จัดหมวดใหม่ตามกฎ keyword')}</button>
        )}
      </div>

      <div className="card">
        {byDay.length === 0 && <div className="empty">{tt('ไม่พบรายการ')}</div>}
        <div className="list">
          {byDay.map(([day, items]) => {
            const s = totals(items);
            return (
              <div key={day}>
                <div className="list-date">
                  {selecting ? (
                    <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={items.every((t) => selected.has(t.id))}
                        onChange={(e) => setMany(items.map((t) => t.id), e.target.checked)}
                        aria-label={tt('เลือกทั้งวัน')}
                        style={{ width: 18, height: 18 }}
                      />
                      <span>{dateLabel(day)}</span>
                    </label>
                  ) : (
                    <span>{dateLabel(day)}</span>
                  )}
                  <span>{s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net))}</span>
                </div>
                {items.map((t) => (
                  <TxRow
                    key={t.id}
                    t={t}
                    onClick={() => setEdit(t)}
                    selectable={selecting}
                    selected={selected.has(t.id)}
                    onToggle={() => toggle(t.id)}
                    onLongPress={() => {
                      setSelecting(true);
                      setSelected(new Set([t.id]));
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {selecting && (
        <div className="selbar" role="region" aria-label={tt('ลบหลายรายการ')}>
          <span className="spacer">{tt('เลือกแล้ว {n} รายการ', { n: picked.length })}</span>
          <button className="btn danger" disabled={picked.length === 0} onClick={bulkDelete}>
            {tt('🗑 ลบที่เลือก ({n})', { n: picked.length })}
          </button>
        </div>
      )}
      {edit && <TransactionForm tx={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
