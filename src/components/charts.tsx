import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { money, moneyShort } from '../lib/format';
import type { Slice } from '../lib/stats';
import { tr, useI18n } from '../lib/i18n';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function DonutWithLegend({ slices, onPick }: { slices: Slice[]; onPick?: (s: Slice) => void }) {
  const { tt } = useI18n();
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className="empty">{tt('ยังไม่มีข้อมูล')}</div>;
  return (
    <>
      <div className="chart-box">
        <Doughnut
          data={{
            labels: slices.map((s) => s.name),
            datasets: [
              {
                data: slices.map((s) => s.value),
                backgroundColor: slices.map((s) => s.color),
                borderColor: css('--surface'),
                borderWidth: 2
              }
            ]
          }}
          options={{
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)} ${tr('บาท')}` } }
            },
            onClick: (_e, els) => {
              if (els[0] && onPick) onPick(slices[els[0].index]);
            }
          }}
        />
      </div>
      <div className="legend">
        {slices.map((s) => (
          <div
            key={s.id}
            className="legend-row"
            style={{ cursor: onPick ? 'pointer' : undefined }}
            onClick={() => onPick?.(s)}
          >
            <span className="dot" style={{ background: s.color }} />
            <span className="name">
              {s.icon ? s.icon + ' ' : ''}
              {s.name}
            </span>
            <span className="val">{money(s.value)}</span>
            <span className="muted small" style={{ width: 44, textAlign: 'right' }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function IncomeExpenseBars({
  labels,
  income,
  expense
}: {
  labels: string[];
  income: number[];
  expense: number[];
}) {
  const { tt } = useI18n();
  const grid = css('--border');
  const text = css('--muted');
  return (
    <div className="chart-box">
      <Bar
        data={{
          labels,
          datasets: [
            { label: tt('รายรับ'), data: income, backgroundColor: css('--income'), borderRadius: 4 },
            { label: tt('รายจ่าย'), data: expense, backgroundColor: css('--expense'), borderRadius: 4 }
          ]
        }}
        options={{
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: text, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y ?? 0)} ${tr('บาท')}` } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: text } },
            y: { grid: { color: grid }, // precision: 0 → ขีดแกนเป็นจำนวนเต็มเสมอ (ไม่งั้นยอดน้อย ๆ จะได้ขีด 0.5, 1 ที่ปัดเป็น 1, 1, 1, 0, 0, 0 ซ้ำกัน)
            ticks: { color: text, precision: 0, callback: (v) => moneyShort(Number(v)) } }
          }
        }}
      />
    </div>
  );
}
