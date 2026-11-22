import type { Account, Category, CategoryGroup, Transaction } from './types';

export function inMonth(t: Transaction, month: string) {
  return t.date.startsWith(month);
}

export function totals(txs: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

export interface Slice {
  id: string;
  name: string;
  color: string;
  icon?: string;
  value: number;
}

export function byGroup(
  txs: Transaction[],
  type: Transaction['type'],
  categoryById: Map<string, Category>,
  groupById: Map<string, CategoryGroup>
): Slice[] {
  const map = new Map<string, Slice>();
  for (const t of txs) {
    if (t.type !== type) continue;
    const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    const g = c ? groupById.get(c.groupId) : undefined;
    const id = g?.id ?? '_none';
    const s = map.get(id) ?? { id, name: g?.name ?? 'ยังไม่จัดหมวด', color: g?.color ?? '#9aa39e', value: 0 };
    s.value += t.amount;
    map.set(id, s);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function byCategory(
  txs: Transaction[],
  type: Transaction['type'],
  categoryById: Map<string, Category>,
  groupById: Map<string, CategoryGroup>
): Slice[] {
  const map = new Map<string, Slice>();
  for (const t of txs) {
    if (t.type !== type) continue;
    const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
    const id = c?.id ?? '_none';
    const s = map.get(id) ?? {
      id,
      name: c?.name ?? 'ยังไม่จัดหมวด',
      icon: c?.icon ?? '❔',
      color: (c && groupById.get(c.groupId)?.color) || '#9aa39e',
      value: 0
    };
    s.value += t.amount;
    map.set(id, s);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function accountBalances(accounts: Account[], txs: Transaction[]) {
  const bal = new Map(accounts.map((a) => [a.id, a.initialBalance || 0]));
  for (const t of txs) {
    if (!t.accountId || !bal.has(t.accountId)) continue;
    bal.set(t.accountId, bal.get(t.accountId)! + (t.type === 'income' ? t.amount : -t.amount));
  }
  return bal;
}
