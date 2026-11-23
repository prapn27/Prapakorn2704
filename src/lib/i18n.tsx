import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EN } from './en';
import { SEED_NAMES_EN } from './seedNames';

/**
 * ระบบแปลภาษาแบบเบา: ใช้ "ข้อความภาษาไทย" เป็นคีย์ (ภาษาไทยคือภาษาต้นฉบับ) และมีตารางแปลอังกฤษใน en.ts
 * - ใน component: const { tt } = useI18n();  →  tt('บันทึก')   (เปลี่ยนภาษาแล้ว re-render เอง)
 * - นอก component (alert, csv ฯลฯ): import { tr } from './i18n'
 * - ตัวแปรในข้อความ: tt('ลบ {n} รายการ', { n })  · พหูพจน์อังกฤษ: ในตารางใช้ 'one item||{n} items' (ตัวแรกใช้เมื่อ n = 1)
 * - ข้อความที่ไม่มีในตารางแปลจะแสดงเป็นภาษาไทยเดิม (มีเทสต์ตรวจว่าครบ)
 */
export type Lang = 'th' | 'en';
const STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'th' || s === 'en') return s;
  } catch {
    /* ไม่มี localStorage (โหมดส่วนตัว ฯลฯ) → ใช้ค่าเริ่มต้น */
  }
  return 'th';
}

let current: Lang = initialLang();

export const getLang = (): Lang => current;

export function tr(key: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? (EN[key] ?? key) : key;
  if (s.includes('||')) {
    const [one, other] = s.split('||');
    s = Number(vars?.n) === 1 ? one : other;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (_m: string, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`)) : s;
}

/** ชื่อที่ผู้ใช้เห็น: หมวด/กลุ่ม/บัญชีตั้งต้นที่ระบบสร้างให้ (ภาษาไทย) จะแสดงเป็นอังกฤษเมื่อเปลี่ยนภาษา — ชื่อที่ผู้ใช้ตั้งเองไม่ถูกแปล */
export function displayName(name: string): string {
  return current === 'en' ? (SEED_NAMES_EN[name] ?? name) : name;
}

interface I18nValue {
  lang: Lang;
  setLang(l: Lang): void;
  tt: typeof tr;
}

const Ctx = createContext<I18nValue>({ lang: 'th', setLang: () => undefined, tt: tr });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      tt: tr,
      setLang(l) {
        current = l;
        try {
          localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* ignore */
        }
        setLangState(l);
      }
    }),
    [lang]
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = tr('สลิปบัญชี');
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** ใช้ในเทสต์เท่านั้น */
export function __setLangForTest(l: Lang) {
  current = l;
}
