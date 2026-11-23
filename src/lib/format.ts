import { getLang } from './i18n';

const fmt = {
  th: new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};
const fmtShort = {
  th: new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
};

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];
export const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
export const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function money(n: number): string {
  return fmt[getLang()].format(n);
}
export function moneyShort(n: number): string {
  return fmtShort[getLang()].format(n);
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

// ภาษาไทยใช้ปี พ.ศ. · ภาษาอังกฤษใช้ ค.ศ.
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return getLang() === 'en' ? `${EN_MONTHS[m - 1]} ${y}` : `${THAI_MONTHS[m - 1]} ${y + 543}`;
}
export function monthLabelShort(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return getLang() === 'en' ? `${EN_MONTHS_SHORT[m - 1]} ${String(y).slice(2)}` : `${THAI_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`;
}

/** ชื่อเดือนแบบย่อตามภาษา (index 0 = มกราคม) */
export function monthNamesShort(): string[] {
  return getLang() === 'en' ? EN_MONTHS_SHORT : THAI_MONTHS_SHORT;
}

/** ปีที่แสดงให้ผู้ใช้เห็น: ไทย = พ.ศ. · อังกฤษ = ค.ศ. */
export function displayYear(year: number): number {
  return getLang() === 'en' ? year : year + 543;
}

/**
 * แปลงปีที่ผู้ใช้พิมพ์เป็น ค.ศ. — คืน null ถ้ายังพิมพ์ไม่ครบ 4 หลักหรือไม่สมเหตุสมผล
 * ค่า ≥ 2400 ถือเป็น พ.ศ. เสมอ (ไม่ว่าอยู่ภาษาไหน) ส่วนค่าที่น้อยกว่านั้นถือเป็น ค.ศ.
 */
export function parseYearInput(s: string): number | null {
  const t = s.trim();
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  const y = n >= 2400 ? n - 543 : n;
  return y >= 1900 && y <= 2200 ? y : null;
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return getLang() === 'en' ? `${EN_MONTHS_SHORT[m - 1]} ${d}, ${y}` : `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

export function timeLabel(date: string): string {
  return date.slice(11, 16);
}

export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
