import { useData } from './store';
import { matchCategory } from './categorize';

/** จัดหมวดรายการที่ "ยังไม่จัดหมวด" ใหม่ตามกฎ keyword ปัจจุบัน */
export function useReapplyRules() {
  const { transactions, categories, bulkSetCategory } = useData();
  return () => {
    const updates = transactions
      .filter((t) => !t.categoryId && t.note)
      .map((t) => {
        const m = matchCategory(t.note, categories, t.type);
        return m ? { id: t.id, categoryId: m.category.id, type: m.category.type } : null;
      })
      .filter((u): u is NonNullable<typeof u> => Boolean(u));
    const left = transactions.filter((t) => !t.categoryId).length - updates.length;
    if (updates.length) bulkSetCategory(updates);
    alert(`จัดหมวดให้ ${updates.length} รายการ${left > 0 ? ` · เหลือ ${left} รายการที่ไม่ตรงกฎไหนเลย` : ''}`);
  };
}
