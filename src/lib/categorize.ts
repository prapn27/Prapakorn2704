import type { Category, TxType } from './types';

/** ทำให้ข้อความเทียบกันได้: ตัวพิมพ์เล็ก ตัดช่องว่าง/เครื่องหมาย และรวม ํา → ำ */
export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/ํา/g, 'ำ')
    .toLowerCase()
    .replace(/[\s​-‍﻿.,:;!?'"`~\-_/\\()[\]{}#*+=|<>]/g, '');
}

export interface CategoryMatch {
  category: Category;
  term: string;
}

/**
 * หาหมวดที่ตรงกับ note มากที่สุด
 * - เทียบกับชื่อหมวดและ keyword ทุกตัว (ไม่สนตัวพิมพ์/ช่องว่าง)
 * - ตรงทั้งคำ (exact) ชนะ "มีคำนี้อยู่" (contains)
 * - ถ้าตรงหลายอัน เลือกคำที่ยาวที่สุด (เจาะจงที่สุด)
 * - ถ้าระบุ preferType จะให้หมวดประเภทนั้นชนะเมื่อความยาวเท่ากัน
 */
export function matchCategory(
  note: string,
  categories: Category[],
  preferType?: TxType
): CategoryMatch | null {
  const n = normalizeText(note);
  if (!n) return null;
  let best: { m: CategoryMatch; score: number } | null = null;
  for (const c of categories) {
    const terms = [c.name, ...(c.keywords || [])];
    for (const raw of terms) {
      const t = normalizeText(raw);
      if (!t) continue;
      let score = -1;
      if (n === t) score = 10000 + t.length;
      else if (n.includes(t)) score = t.length * 10;
      if (score < 0) continue;
      if (preferType && c.type === preferType) score += 1;
      if (!best || score > best.score) best = { m: { category: c, term: raw }, score };
    }
  }
  return best?.m ?? null;
}

/** แยก keyword จากช่องกรอก (คั่นด้วย , หรือขึ้นบรรทัดใหม่) */
export function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const k = part.trim();
    const key = normalizeText(k);
    if (k && !seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}
