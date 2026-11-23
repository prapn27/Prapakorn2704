import type { TableName } from '../shared/schema';

/** การจับคู่ฟิลด์ฝั่ง client (camelCase) กับคอลัมน์ใน D1 (snake_case) */
export interface TableSpec {
  table: string;
  fields: { key: string; col: string; json?: boolean }[];
}

export const SPECS: Record<TableName, TableSpec> = {
  accounts: {
    table: 'accounts',
    fields: [
      { key: 'name', col: 'name' },
      { key: 'initialBalance', col: 'initial_balance' },
      { key: 'color', col: 'color' },
      { key: 'order', col: 'ord' }
    ]
  },
  groups: {
    table: 'category_groups',
    fields: [
      { key: 'name', col: 'name' },
      { key: 'type', col: 'type' },
      { key: 'color', col: 'color' },
      { key: 'order', col: 'ord' }
    ]
  },
  categories: {
    table: 'categories',
    fields: [
      { key: 'name', col: 'name' },
      { key: 'groupId', col: 'group_id' },
      { key: 'type', col: 'type' },
      { key: 'icon', col: 'icon' },
      { key: 'keywords', col: 'keywords', json: true },
      { key: 'budget', col: 'budget' },
      { key: 'order', col: 'ord' }
    ]
  },
  transactions: {
    table: 'transactions',
    fields: [
      { key: 'type', col: 'type' },
      { key: 'amount', col: 'amount' },
      { key: 'date', col: 'date' },
      { key: 'categoryId', col: 'category_id' },
      { key: 'accountId', col: 'account_id' },
      { key: 'note', col: 'note' },
      { key: 'source', col: 'source' },
      { key: 'slipRef', col: 'slip_ref' },
      { key: 'bank', col: 'bank' },
      { key: 'createdAt', col: 'created_at' }
    ]
  }
};
