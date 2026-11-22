import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../lib/store';
import { dateLabel, money, monthKey } from '../lib/format';
import { normalizeText } from '../lib/categorize';
import { totals } from '../lib/stats';
import { useReapplyRules } from '../lib/useReapply';
import { AccountSelect, MonthPicker, TxRow } from '../components/ui';
import { TransactionForm } from '../components/TransactionForm';
import type { Transaction } from '../lib/types';

export default function Transactions() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const [month, setMonth] = useState<string | null>(cat === 'none' ? null : monthKey(new Date()));
  const [type, setType] = useState<'' | 'income' | 'expense'>('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Transaction | null>(null);
  const reapply = useReapplyRules();

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
        const c = t.categoryId ? data.categoryById.get(t.categoryId)?.name ?? '' : '';
        if (!normalizeText(`${t.note} ${c} ${t.amount}`).includes(nq)) return false;
      }
      return true;
    });
  }, [data.transactions, data.categoryById, month, type, accountId, cat, q]);

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

  return (
    <div className="page">
      {month ? (
        <MonthPicker value={month} onChange={setMonth} />
      ) : (
        <div className="row">
          <strong>ทุกเดือน</strong>
          <span className="spacer" />
          <button className="btn sm" onClick={() => setMonth(monthKey(new Date()))}>เลือกเดือน</button>
        </div>
      )}
      <div className="card stack">
        <input className="input" placeholder="🔍 ค้นหา note / หมวด / ยอด" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="">ทุกประเภท</option>
            <option value="expense">รายจ่าย</option>
            <option value="income">รายรับ</option>
          </select>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">ทุกหมวด</option>
            <option value="none">❔ ยังไม่จัดหมวด</option>
            {data.groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {data.categories
                  .filter((c) => c.groupId === g.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="spacer"><AccountSelect value={accountId} onChange={setAccountId} /></div>
          {month && (
            <button className="btn sm ghost" onClick={() => setMonth(null)}>ทุกเดือน</button>
          )}
        </div>
        <div className="row small">
          <span className="muted">{list.length} รายการ</span>
          <span className="spacer" />
          <span className="income">+{money(sum.income)}</span>
          <span className="expense">−{money(sum.expense)}</span>
        </div>
        {cat === 'none' && list.length > 0 && (
          <button className="btn sm" onClick={reapply}>⚡ จัดหมวดใหม่ตามกฎ keyword</button>
        )}
      </div>

      <div className="card">
        {byDay.length === 0 && <div className="empty">ไม่พบรายการ</div>}
        <div className="list">
          {byDay.map(([day, items]) => {
            const s = totals(items);
            return (
              <div key={day}>
                <div className="list-date">
                  <span>{dateLabel(day)}</span>
                  <span>{s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net))}</span>
                </div>
                {items.map((t) => (
                  <TxRow key={t.id} t={t} onClick={() => setEdit(t)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {edit && <TransactionForm tx={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
