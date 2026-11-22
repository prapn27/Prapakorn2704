/**
 * แปลงข้อความที่ได้จาก OCR ของสลิปโอนเงิน → ยอดเงิน วันเวลา note ธนาคาร
 * ออกแบบให้ใช้ได้กับสลิปทุกธนาคารแบบกว้าง ๆ และค่อยเพิ่มกฎเฉพาะธนาคารทีหลัง
 */

export interface ParsedSlip {
  amount: number | null;
  /** YYYY-MM-DDTHH:mm */
  date: string | null;
  note: string;
  bank: string | null;
}

export interface SlipQr {
  raw: string;
  bankCode: string | null;
  transRef: string | null;
}

export const BANK_CODES: Record<string, string> = {
  '002': 'กรุงเทพ',
  '004': 'กสิกรไทย',
  '006': 'กรุงไทย',
  '011': 'ทีทีบี',
  '014': 'ไทยพาณิชย์',
  '022': 'ซีไอเอ็มบี',
  '024': 'ยูโอบี',
  '025': 'กรุงศรี',
  '030': 'ออมสิน',
  '033': 'ธอส.',
  '034': 'ธ.ก.ส.',
  '067': 'ทิสโก้',
  '069': 'เกียรตินาคินภัทร',
  '073': 'แลนด์ แอนด์ เฮ้าส์'
};

const BANK_PATTERNS: [RegExp, string][] = [
  [/k\+|kplus|kbank|กสิกร/i, 'กสิกรไทย'],
  [/scb|ไทยพาณิชย์|ไทยพาณิชย/i, 'ไทยพาณิชย์'],
  [/krungthai|กรุงไทย|ktb|เป๋าตัง/i, 'กรุงไทย'],
  [/bangkokbank|bualuang|บัวหลวง|ธนาคารกรุงเทพ/i, 'กรุงเทพ'],
  [/krungsri|กรุงศรี|kma/i, 'กรุงศรี'],
  [/ttb|ทหารไทยธนชาต|ทีทีบี/i, 'ทีทีบี'],
  [/mymo|ออมสิน|gsb/i, 'ออมสิน'],
  [/uob/i, 'ยูโอบี'],
  [/cimb/i, 'ซีไอเอ็มบี'],
  [/kkp|เกียรตินาคิน/i, 'เกียรตินาคินภัทร'],
  [/lhbank|แลนด์แอนด์เฮ้าส์/i, 'แลนด์ แอนด์ เฮ้าส์'],
  [/baac|ธ\.?ก\.?ส/i, 'ธ.ก.ส.']
];

const MONTHS: Record<string, number> = {};
[
  ['มค', 'มกราคม', 'jan', 'january'],
  ['กพ', 'กุมภาพันธ์', 'feb', 'february'],
  ['มีค', 'มีนาคม', 'mar', 'march'],
  ['เมย', 'เมษายน', 'apr', 'april'],
  ['พค', 'พฤษภาคม', 'may'],
  ['มิย', 'มิถุนายน', 'jun', 'june'],
  ['กค', 'กรกฎาคม', 'jul', 'july'],
  ['สค', 'สิงหาคม', 'aug', 'august'],
  ['กย', 'กันยายน', 'sep', 'sept', 'september'],
  ['ตค', 'ตุลาคม', 'oct', 'october'],
  ['พย', 'พฤศจิกายน', 'nov', 'november'],
  ['ธค', 'ธันวาคม', 'dec', 'december']
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));

const NOTE_LABELS = ['บันทึกช่วยจำ', 'บันทึกช่วยจํา', 'บันทึก', 'หมายเหตุ', 'ข้อความ', 'memo', 'note', 'remark'];
const STOP_LABELS = [
  'ค่าธรรมเนียม', 'เลขที่รายการ', 'รหัสอ้างอิง', 'เลขที่อ้างอิง', 'จำนวน', 'วันที่', 'สแกน', 'ตรวจสอบ',
  'fee', 'ref', 'transaction', 'amount', 'scan', 'verify'
];
const AMOUNT_LABELS = ['จำนวนเงิน', 'จำนวน', 'ยอดเงิน', 'ยอดโอน', 'amount', 'total'];
const AMOUNT_EXCLUDE = ['ค่าธรรมเนียม', 'คงเหลือ', 'fee', 'balance', 'available'];

/** รวม ํา→ำ และลบช่องว่างที่ OCR ชอบแทรกระหว่างตัวอักษรไทย */
export function cleanOcrText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/ํา/g, 'ำ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/([฀-๿])[ \t]+(?=[฀-๿])/g, '$1')
    .replace(/[ \t]+/g, ' ');
}

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, '');

const AMOUNT_RE = /(\d{1,3}(?:,\d{3})+|\d+)\s?[.,]\s?(\d{2})(?!\d)/g;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  // ตัดเวลา (เช่น 14:35) ออกก่อน กันโดนอ่านเป็นยอดเงิน
  const l = line.replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ');
  for (const m of l.matchAll(AMOUNT_RE)) {
    const n = Number(m[1].replace(/,/g, '') + '.' + m[2]);
    if (Number.isFinite(n) && n > 0 && n < 100_000_000) out.push(n);
  }
  return out;
}

export function extractAmount(lines: string[]): number | null {
  const isExcluded = (l: string) => AMOUNT_EXCLUDE.some((k) => compact(l).includes(k));
  // 1) บรรทัดที่มีคำว่า "จำนวนเงิน" หรือบรรทัดถัดไป
  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    if (AMOUNT_LABELS.some((k) => c.includes(k)) && !isExcluded(lines[i])) {
      for (let j = i; j < Math.min(lines.length, i + 3); j++) {
        if (j > i && isExcluded(lines[j])) break;
        const a = amountsIn(lines[j]);
        if (a.length) return a[0];
      }
    }
  }
  // 2) ตัวเลขที่ตามด้วย "บาท" หรือ THB
  for (const l of lines) {
    if (isExcluded(l)) continue;
    if (/บาท|thb|฿/i.test(l)) {
      const a = amountsIn(l);
      if (a.length) return a[0];
    }
  }
  // 3) ตัวเลขทศนิยม 2 ตำแหน่งที่มากที่สุด
  let best: number | null = null;
  for (const l of lines) {
    if (isExcluded(l)) continue;
    for (const a of amountsIn(l)) if (best === null || a > best) best = a;
  }
  return best;
}

function resolveYear(raw: string, now: Date): number | null {
  let y = Number(raw);
  if (!Number.isFinite(y)) return null;
  const cur = now.getFullYear();
  if (raw.length <= 2) {
    const be = 2500 + y - 543;
    if (be >= cur - 5 && be <= cur + 1) return be;
    return 2000 + y;
  }
  if (y > 2400) y -= 543;
  return y;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1;
}

export function extractDate(lines: string[], now = new Date()): string | null {
  const text = lines.join('\n');
  let ymd: [number, number, number] | null = null;
  let lineIdx = -1;

  const named = /(\d{1,2})\s*([ก-๙]{1,3}\s?\.?\s?[ก-๙]{0,3}\s?\.?|[a-z]{3,9}\.?)\s*,?\s*(\d{4}|\d{2})(?!\d)/i;
  const numeric = /(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/;

  for (let i = 0; i < lines.length && !ymd; i++) {
    const m = lines[i].match(named);
    if (m) {
      const key = m[2].toLowerCase().replace(/[\s.]/g, '');
      const month = MONTHS[key];
      const year = resolveYear(m[3], now);
      const day = Number(m[1]);
      if (month && year && validDate(year, month, day)) {
        ymd = [year, month, day];
        lineIdx = i;
        break;
      }
    }
    const n = lines[i].match(numeric);
    if (n) {
      const year = resolveYear(n[3], now);
      const month = Number(n[2]);
      const day = Number(n[1]);
      if (year && validDate(year, month, day)) {
        ymd = [year, month, day];
        lineIdx = i;
      }
    }
  }
  if (!ymd) return null;

  const timeRe = /(\d{1,2})\s?:\s?(\d{2})(?::\d{2})?/;
  const timeRe2 = /(\d{1,2})\.(\d{2})\s*น/;
  const near = [lines[lineIdx], lines[lineIdx + 1] ?? '', lines[lineIdx - 1] ?? '', text];
  let hh = 0;
  let mm = 0;
  for (const l of near) {
    const t = l.match(timeRe) || l.match(timeRe2);
    if (t && Number(t[1]) < 24 && Number(t[2]) < 60) {
      hh = Number(t[1]);
      mm = Number(t[2]);
      break;
    }
  }
  return `${ymd[0]}-${pad(ymd[1])}-${pad(ymd[2])}T${pad(hh)}:${pad(mm)}`;
}

export function extractNote(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const c = compact(line);
    const label = NOTE_LABELS.find((k) => c.startsWith(k));
    if (!label) continue;
    // ตัดป้ายกำกับออก (ป้ายอาจมีช่องว่างแทรกจาก OCR)
    let rest = line;
    let seen = 0;
    let cut = 0;
    for (let k = 0; k < line.length && seen < label.length; k++) {
      if (!/\s/.test(line[k])) seen++;
      cut = k + 1;
    }
    rest = line.slice(cut).replace(/^[\s:：\-–]+/, '').trim();
    if (rest) return rest;
    const next = (lines[i + 1] || '').trim();
    if (next && !STOP_LABELS.some((s) => compact(next).startsWith(s))) return next;
    return '';
  }
  return '';
}

export function detectBank(text: string): string | null {
  const c = compact(text);
  for (const [re, name] of BANK_PATTERNS) if (re.test(c)) return name;
  return null;
}

export function parseSlipText(text: string, now = new Date()): ParsedSlip {
  const cleaned = cleanOcrText(text);
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    amount: extractAmount(lines),
    date: extractDate(lines, now),
    note: extractNote(lines),
    bank: detectBank(cleaned)
  };
}

/** อ่าน QR มาตรฐานสลิปโอนเงินไทย (TLV): tag 00 → {00: API id, 01: รหัสธนาคาร, 02: เลขอ้างอิง} */
export function parseSlipQr(raw: string): SlipQr {
  const result: SlipQr = { raw, bankCode: null, transRef: null };
  const tlv = (s: string) => {
    const out: Record<string, string> = {};
    let i = 0;
    while (i + 4 <= s.length) {
      const tag = s.slice(i, i + 2);
      const len = Number(s.slice(i + 2, i + 4));
      if (!/^\d{2}$/.test(tag) || !Number.isFinite(len)) break;
      out[tag] = s.slice(i + 4, i + 4 + len);
      i += 4 + len;
    }
    return out;
  };
  try {
    const top = tlv(raw);
    if (top['00']) {
      const sub = tlv(top['00']);
      if (sub['01'] && /^\d{3}$/.test(sub['01'])) result.bankCode = sub['01'];
      if (sub['02']) result.transRef = sub['02'];
    }
  } catch {
    /* ไม่ใช่รูปแบบมาตรฐาน — ใช้ raw อย่างเดียว */
  }
  return result;
}

export function slipRefFromQr(qr: SlipQr): string {
  return qr.transRef ? `${qr.bankCode ?? 'x'}:${qr.transRef}` : qr.raw;
}
