import type { Anomaly, Expense } from './ledger'

const headings: Record<Anomaly['kind'], string> = {
  invalid: 'Not imported',
  duplicate: 'Duplicates',
  'possible-duplicate': 'Possible duplicates',
  'ambiguous-receipt': 'Ambiguous receipts',
  'unmatched-receipt': 'Receipts without a ledger line',
  'no-receipt': 'Ledger lines without a receipt',
  corrected: 'Corrections applied',
}

const dollars = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

export const report = (
  expenses: readonly Expense[],
  anomalies: readonly Anomaly[],
  receiptCount: number,
): string => {
  const totals = Map.groupBy(
    expenses,
    (expense) => `${expense.date.slice(0, 4)} ${expense.category}`,
  )
  const sections = Object.entries(headings).flatMap(([kind, heading]) => {
    const items = anomalies.filter((anomaly) => anomaly.kind === kind)
    if (items.length === 0) {
      return []
    }
    return [
      `## ${heading} (${items.length})`,
      items
        .map(
          ({ line, file, message }) =>
            `- ${[line && `line ${line}`, file && `\`${file}\``].filter(Boolean).join(', ')}: ${message}`,
        )
        .join('\n'),
    ]
  })
  return (
    [
      '# Ledger import',
      `${expenses.length} expenses, ${receiptCount} receipts matched.`,
      ...sections,
      '## Totals by year and category',
      '| Year | Category | Expenses | Total |\n| --- | --- | --- | --- |\n' +
        [...totals.entries()]
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([key, group]) => {
            const [year, category] = key.split(' ')
            const total = group.reduce(
              (sum, { amountCents }) => sum + amountCents,
              0,
            )
            return `| ${year} | ${category} | ${group.length} | ${dollars(total)} |`
          })
          .join('\n'),
    ].join('\n\n') + '\n'
  )
}
