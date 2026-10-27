import type { Expense } from './ledger'

export type StoredReceipt = {
  key: string
  sha256: string
}

const quote = (value: string | number | null): string => {
  if (value === null) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return `'${value.replaceAll("'", "''")}'`
}

export const importKey = (expense: Expense): string => `ledger:${expense.line}`

export const importSql = (
  expenses: readonly Expense[],
  receipts: ReadonlyMap<number, StoredReceipt>,
): string => {
  const payers = [
    ...new Set(expenses.map((expense) => expense.payer)),
  ].toSorted()
  const statements = [
    ...payers.map(
      (payer) =>
        `INSERT INTO members (name) VALUES (${quote(payer)}) ON CONFLICT (name) DO NOTHING;`,
    ),
    ...expenses.map((expense) => {
      const receipt = receipts.get(expense.line)
      const values = [
        `(SELECT id FROM members WHERE name = ${quote(expense.payer)})`,
        quote(expense.date),
        quote(expense.amountCents),
        quote(expense.vendor),
        quote(expense.description),
        quote(expense.category),
        quote(expense.discipline),
        quote(receipt?.key ?? null),
        quote(receipt?.sha256 ?? null),
        quote(expense.status),
        quote('import'),
        quote(importKey(expense)),
      ]
      return [
        'INSERT INTO expenses (member_id, date, amount_cents, vendor, description, category, discipline, receipt_key, receipt_sha256, status, source, import_key)',
        `VALUES (${values.join(', ')})`,
        'ON CONFLICT (import_key) DO UPDATE SET member_id = excluded.member_id, date = excluded.date, amount_cents = excluded.amount_cents, vendor = excluded.vendor, description = excluded.description, category = excluded.category, discipline = excluded.discipline, receipt_key = excluded.receipt_key, receipt_sha256 = excluded.receipt_sha256, status = excluded.status;',
      ].join('\n')
    }),
  ]
  return statements.join('\n\n') + '\n'
}
