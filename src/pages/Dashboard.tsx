import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/store';
import { monthKey, money } from '../lib/format';
import { byGroup, inMonth, totals } from '../lib/stats';
import { MonthPicker, TxRow } from '../components/ui';
import { DonutWithLegend } from '../components/charts';
import { TransactionForm } from '../components/TransactionForm';
import type { Transaction } from '../lib/types';
import { displayName, useI18n } from '../lib/i18n';

export default function Dashboard() {
  const { tt } = useI18n();
  const { transactions, categories, categoryById, groupById } = useData();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [edit, setEdit] = useState<Transaction | null>(null);

  const monthTx = useMemo(() => transactions.filter((t) => inMonth(t, month)), [transactions, month]);
  const sum = totals(monthTx);
  const uncategorized = transactions.filter((t) => !t.categoryId).length;
  const groupsSlices = byGroup(monthTx, 'expense', categoryById, groupById);

  const budgets = categories
    .filter((c) => (c.budget ?? 0) > 0)
    .map((c) => {
      const spent = monthTx
        .filter((t) => t.categoryId === c.id && t.type === c.type)
        .reduce((s, t) => s + t.amount, 0);
      return { c, spent, pct: spent / (c.budget || 1) };
    })
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="page">
      <MonthPicker value={month} onChange={setMonth} />
      <div className="stats">
        <div className="stat">
          <div className="label">{tt('รายรับ')}</div>
          <div className="value income">{money(sum.income)}</div>
        </div>
        <div className="stat">
          <div className="label">{tt('รายจ่าย')}</div>
          <div className="value expense">{money(sum.expense)}</div>
        </div>
        <div className="stat">
          <div className="label">{tt('คงเหลือ')}</div>
          <div className={`value ${sum.net < 0 ? 'expense' : ''}`}>{money(sum.net)}</div>
        </div>
      </div>

      {uncategorized > 0 && (
        <Link className="banner warn" to="/transactions?cat=none">
          <span>❔</span>
          <span className="spacer">{tt('มี {n} รายการที่ยังไม่จัดหมวด', { n: uncategorized })}</span>
          <span>›</span>
        </Link>
      )}

      <Link className="banner" to="/import">
        <span>🧾</span>
        <span className="spacer">{tt('นำเข้าจากสลิปโอนเงิน')}</span>
        <span>›</span>
      </Link>

      {budgets.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>{tt('งบประมาณเดือนนี้')}</h2>
            <Link to="/settings/categories" className="small">{tt('ตั้งงบ')}</Link>
          </div>
          <div className="stack">
            {budgets.map(({ c, spent, pct }) => (
              <div key={c.id}>
                <div className="row small">
                  <span>{c.icon} {displayName(c.name)}</span>
                  <span className="spacer" />
                  <span className={pct > 1 ? 'danger-text' : 'muted'}>
                    {money(spent)} / {money(c.budget!)}
                  </span>
                </div>
                <div className={`progress ${pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : ''}`}>
                  <div style={{ width: `${Math.min(100, pct * 100)}%` }} />
                </div>
                {pct > 1 && <div className="small danger-text">{tt('เกินงบ {amount} บาท', { amount: money(spent - c.budget!) })}</div>}
                {pct >= 0.8 && pct <= 1 && <div className="small" style={{ color: 'var(--warn)' }}>{tt('ใกล้เต็มงบแล้ว')}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>{tt('รายจ่ายตามกลุ่ม')}</h2>
          <Link to="/reports" className="small">{tt('ดูรายงาน')}</Link>
        </div>
        <DonutWithLegend slices={groupsSlices} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{tt('ล่าสุด')}</h2>
          <Link to="/transactions" className="small">{tt('ดูทั้งหมด')}</Link>
        </div>
        {monthTx.length === 0 ? (
          <div className="empty">{tt('ยังไม่มีรายการในเดือนนี้ — กด + เพื่อเพิ่ม')}</div>
        ) : (
          <div className="list">
            {monthTx.slice(0, 6).map((t) => (
              <TxRow key={t.id} t={t} onClick={() => setEdit(t)} />
            ))}
          </div>
        )}
      </div>
      {edit && <TransactionForm tx={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
