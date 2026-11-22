const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShortFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

export function money(n: number): string {
  return moneyFmt.format(n);
}
export function moneyShort(n: number): string {
  return moneyShortFmt.format(n);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM" */
export function monthKey(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}
export function monthLabelShort(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${THAI_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`;
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

export function timeLabel(date: string): string {
  return date.slice(11, 16);
}

export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
