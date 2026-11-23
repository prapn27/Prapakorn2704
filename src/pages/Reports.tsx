import { useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { monthKey, monthLabelShort, shiftMonth, money } from '../lib/format';
import { byCategory, byGroup, inMonth, totals, type Slice } from '../lib/stats';
import { MonthPicker } from '../components/ui';
import { DonutWithLegend, IncomeExpenseBars } from '../components/charts';
import type { TxType } from '../lib/types';
import { useI18n } from '../lib/i18n';

export default function Reports() {
  const { tt } = useI18n();
  const { transactions, categoryById, groupById } = useData();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [type, setType] = useState<TxType>('expense');
  const [view, setView] = useState<'group' | 'category'>('group');
  const [drill, setDrill] = useState<Slice | null>(null);

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const series = months.map((m) => totals(transactions.filter((t) => inMonth(t, m))));
  const monthTx = useMemo(() => transactions.filter((t) => inMonth(t, month)), [transactions, month]);

  let slices: Slice[];
  if (drill) {
    slices = byCategory(
      monthTx.filter((t) => {
        const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
        return (c?.groupId ?? '_none') === drill.id;
      }),
      type,
      categoryById,
      groupById
    );
  } else if (view === 'group') slices = byGroup(monthTx, type, categoryById, groupById);
  else slices = byCategory(monthTx, type, categoryById, groupById);

  const avgExpense = series.reduce((s, x) => s + x.expense, 0) / series.length;

  return (
    <div className="page">
      <MonthPicker value={month} onChange={(m) => { setMonth(m); setDrill(null); }} />
      <div className="card">
        <h2>{tt('6 เดือนล่าสุด')}</h2>
        <IncomeExpenseBars
          labels={months.map(monthLabelShort)}
          income={series.map((s) => s.income)}
          expense={series.map((s) => s.expense)}
        />
        <div className="small muted" style={{ marginTop: 8 }}>{tt('รายจ่ายเฉลี่ย {amount} บาท/เดือน', { amount: money(avgExpense) })}</div>
      </div>
      <div className="card stack">
        <div className="seg">
          <button className={type === 'expense' ? 'on expense' : ''} onClick={() => { setType('expense'); setDrill(null); }}>{tt('รายจ่าย')}</button>
          <button className={type === 'income' ? 'on income' : ''} onClick={() => { setType('income'); setDrill(null); }}>{tt('รายรับ')}</button>
        </div>
        {!drill ? (
          <div className="seg">
            <button className={view === 'group' ? 'on' : ''} onClick={() => setView('group')}>{tt('ตามกลุ่ม')}</button>
            <button className={view === 'category' ? 'on' : ''} onClick={() => setView('category')}>{tt('ตามหมวด')}</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn sm" onClick={() => setDrill(null)}>{tt('‹ กลับ')}</button>
            <strong>{drill.name}</strong>
            <span className="spacer" />
            <span>{money(drill.value)}</span>
          </div>
        )}
        <DonutWithLegend
          slices={slices}
          onPick={!drill && view === 'group' ? (s) => setDrill(s) : undefined}
        />
        {!drill && view === 'group' && slices.length > 0 && <div className="small muted">{tt('แตะกลุ่มเพื่อดูหมวดย่อย')}</div>}
      </div>
    </div>
  );
}
