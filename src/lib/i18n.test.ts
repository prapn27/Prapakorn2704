import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_GROUPS } from '../../shared/defaults';
import { EN } from './en';
import { dateLabel, money, monthLabel, monthLabelShort } from './format';
import { __setLangForTest, displayName, tr } from './i18n';
import { SEED_NAMES_EN } from './seedNames';
import { BANK_NAMES } from './slipParser';

const src = path.resolve(import.meta.dirname, '..');
const TH = /[฀-๿]/;
const read = (f: string) => readFileSync(path.join(src, f), 'utf8');
const list = (dir: string) => readdirSync(path.join(src, dir)).filter((f) => f.endsWith('.tsx')).map((f) => `${dir}/${f}`);

/** ไฟล์ที่แสดงข้อความให้ผู้ใช้เห็น (ข้อความไทยทั้งหมดต้องผ่าน tt()/tr()) */
const UI_FILES = ['App.tsx', ...list('components'), ...list('pages'), 'lib/store.tsx', 'lib/sync.ts', 'lib/api.ts', 'lib/csv.ts', 'lib/stats.ts', 'lib/useReapply.ts'];

const KEY_CALL = /\b(?:tt|tr)\(\s*'((?:[^'\\]|\\.)*)'/g;
const unescape = (s: string) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

function usedKeys(): { file: string; key: string }[] {
  const out: { file: string; key: string }[] = [];
  for (const f of UI_FILES) {
    for (const line of read(f).split('\n')) {
      for (const m of line.matchAll(KEY_CALL)) out.push({ file: f, key: unescape(m[1]) });
      if (line.includes('i18n-key')) {
        for (const m of line.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (TH.test(m[1])) out.push({ file: f, key: unescape(m[1]) });
      }
    }
  }
  return out;
}

const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

afterEach(() => __setLangForTest('th'));

describe('ตารางแปลอังกฤษ', () => {
  it('ทุกข้อความที่เรียก tt()/tr() มีคำแปล', () => {
    const missing = usedKeys().filter(({ key }) => !(key in EN));
    expect(missing).toEqual([]);
  });

  it('ไม่มีคำแปลที่ไม่ได้ใช้ (กันตารางรก)', () => {
    const used = new Set(usedKeys().map((k) => k.key));
    expect(Object.keys(EN).filter((k) => !used.has(k))).toEqual([]);
  });

  it('ตัวแปร {x} ในคำแปลตรงกับต้นฉบับ และพหูพจน์ใช้กับข้อความที่มี {n}', () => {
    for (const [key, val] of Object.entries(EN)) {
      const want = placeholders(key);
      const parts = val.split('||');
      expect(parts.length, key).toBeLessThanOrEqual(2);
      if (parts.length === 2) expect(want.has('n'), `plural without {n}: ${key}`).toBe(true);
      // ส่วนสุดท้าย (พหูพจน์/ปกติ) ต้องมีตัวแปรครบ · ส่วน "หนึ่ง" อาจตัด {n} ออกได้ ("1 transaction")
      const last = placeholders(parts[parts.length - 1]);
      expect([...want].sort(), key).toEqual([...last].sort());
      if (parts.length === 2) {
        const one = placeholders(parts[0]);
        expect([...one].every((p) => want.has(p)), key).toBe(true);
      }
    }
  });

  it('คำแปลไม่เหลือภาษาไทย', () => {
    const left = Object.entries(EN).filter(([, v]) => TH.test(v));
    expect(left).toEqual([]);
  });
});

describe('ไม่มีข้อความไทยหลุดนอกระบบแปล', () => {
  it.each(UI_FILES)('%s', (f) => {
    const code = read(f)
      .split('\n')
      .filter((l) => !l.includes('i18n-key') && !l.includes('i18n-skip')) // บรรทัดที่ตั้งใจเว้นไว้ (เช่นชื่อภาษา "ไทย")
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(KEY_CALL, '');
    const bad = code.split('\n').filter((l) => TH.test(l));
    expect(bad, `ข้อความไทยที่ยังไม่ผ่าน tt()/tr() ใน ${f}`).toEqual([]);
  });
});

describe('tr / displayName', () => {
  it('ภาษาไทย: คืนข้อความเดิมพร้อมแทนตัวแปร', () => {
    expect(tr('ลบ {n} รายการ', { n: 3 })).toBe('ลบ 3 รายการ');
    expect(tr('ซิงก์แล้ว')).toBe('ซิงก์แล้ว');
  });

  it('ภาษาอังกฤษ: แปล แทนตัวแปร และเลือกเอกพจน์/พหูพจน์', () => {
    __setLangForTest('en');
    expect(tr('ซิงก์แล้ว')).toBe('Synced');
    expect(tr('{n} รายการ', { n: 1 })).toBe('1 transaction');
    expect(tr('{n} รายการ', { n: 0 })).toBe('0 transactions');
    expect(tr('{n} รายการ', { n: 25 })).toBe('25 transactions');
    expect(tr('ลบ {n} รายการที่เลือก?', { n: 1 })).toBe('Delete 1 selected transaction?');
    expect(tr('ลบ {n} รายการที่เลือก?', { n: 4 })).toBe('Delete 4 selected transactions?');
    expect(tr('เกินงบ {amount} บาท', { amount: '1,200.00' })).toBe('Over budget by 1,200.00 THB');
  });

  it('ข้อความที่ไม่มีในตาราง → แสดงต้นฉบับ ไม่ error', () => {
    __setLangForTest('en');
    expect(tr('ข้อความที่ไม่มีคำแปล')).toBe('ข้อความที่ไม่มีคำแปล');
    expect(tr('มี {n} อย่าง', { n: 2 })).toBe('มี 2 อย่าง');
  });

  it('ชื่อหมวด/กลุ่ม/บัญชี/ธนาคารตั้งต้นแปลได้ แต่ชื่อที่ผู้ใช้ตั้งเองไม่ถูกแปล', () => {
    expect(displayName('อาหาร')).toBe('อาหาร');
    __setLangForTest('en');
    expect(displayName('อาหาร')).toBe('Meals');
    expect(displayName('กสิกรไทย')).toBe('Kasikornbank');
    expect(displayName('ค่าข้าวเที่ยงที่ร้านป้า')).toBe('ค่าข้าวเที่ยงที่ร้านป้า');
    expect(displayName('My own category')).toBe('My own category');
  });

  it('ชื่อตั้งต้นทุกอัน (หมวด กลุ่ม บัญชี ธนาคาร) มีคำแปลอังกฤษ', () => {
    const names = [
      ...DEFAULT_ACCOUNTS.map((a) => a.name),
      ...DEFAULT_GROUPS.flatMap((g) => [g.name, ...g.categories.map((c) => c[0])]),
      ...BANK_NAMES
    ];
    expect(names.filter((n) => !(n in SEED_NAMES_EN))).toEqual([]);
    expect(Object.values(SEED_NAMES_EN).filter((v) => TH.test(v))).toEqual([]);
  });
});

describe('รูปแบบวันที่และตัวเลขตามภาษา', () => {
  it('ไทย: ปี พ.ศ. และเดือนภาษาไทย', () => {
    expect(monthLabel('2026-11')).toBe('พฤศจิกายน 2569');
    expect(monthLabelShort('2026-11')).toBe('พ.ย. 69');
    expect(dateLabel('2026-11-23T11:15')).toBe('23 พ.ย. 2569');
    expect(money(1234.5)).toBe('1,234.50');
  });

  it('อังกฤษ: ปี ค.ศ. และเดือนภาษาอังกฤษ', () => {
    __setLangForTest('en');
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(monthLabelShort('2026-11')).toBe('Nov 26');
    expect(dateLabel('2026-11-23T11:15')).toBe('Nov 23, 2026');
    expect(money(1234.5)).toBe('1,234.50');
  });
});
