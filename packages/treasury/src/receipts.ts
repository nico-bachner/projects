import type { Anomaly, Expense, Overrides } from './ledger'

export type Receipt = {
  file: string
  date: string
  item: string
  extension: 'jpg' | 'pdf' | 'png'
}

const filenamePattern = /^(\d{4}-\d{2}-\d{2}) (.+)\.(jpg|pdf|png)$/iu

export const parseReceiptName = (file: string): Receipt | undefined => {
  const match = filenamePattern.exec(file)
  if (!match) {
    return undefined
  }
  return {
    file,
    date: match[1]!,
    item: match[2]!,
    extension: match[3]!.toLowerCase() as Receipt['extension'],
  }
}

const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFKD')
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 1),
  )

export const similarity = (a: string, b: string): number => {
  const left = tokens(a)
  const right = tokens(b)
  const shared = [...left].filter((token) => right.has(token)).length
  const total = new Set([...left, ...right]).size
  return total === 0 ? 0 : shared / total
}

const shiftDate = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)

const nearbyDates = (date: string): string[] =>
  [1, -1, 2, -2, 3, -3].map((days) => shiftDate(date, days))

export const matchReceipts = (
  expenses: readonly Expense[],
  files: readonly string[],
  overrides: Overrides = {},
): { matches: Map<number, string>; anomalies: Anomaly[] } => {
  const matches = new Map<number, string>()
  const anomalies: Anomaly[] = []
  const byDate = Map.groupBy(expenses, (expense) => expense.date)
  const lines = new Set(expenses.map((expense) => expense.line))
  const claim = (line: number, file: string): void => {
    const existing = matches.get(line)
    if (existing) {
      anomalies.push({
        line,
        file,
        kind: 'ambiguous-receipt',
        message: `Line already matched to "${existing}".`,
      })
      return
    }
    matches.set(line, file)
  }
  const pending: Receipt[] = []
  for (const file of files.toSorted()) {
    const override = overrides.receipts?.[file]
    if (override === null) {
      continue
    }
    if (override !== undefined) {
      if (lines.has(override)) {
        claim(override, file)
      } else {
        anomalies.push({
          file,
          kind: 'unmatched-receipt',
          message: `Override points to line ${override}, which is not imported.`,
        })
      }
      continue
    }
    const receipt = parseReceiptName(file)
    if (!receipt) {
      anomalies.push({
        file,
        kind: 'unmatched-receipt',
        message: 'Name is not "YYYY-MM-DD Item purchased.(png|pdf|jpg)".',
      })
      continue
    }
    pending.push(receipt)
  }
  for (const receipt of pending) {
    const best = (candidates: readonly Expense[]) =>
      candidates
        .filter((expense) => !matches.has(expense.line))
        .map((expense) => ({
          expense,
          score: similarity(
            receipt.item,
            `${expense.vendor} ${expense.description}`,
          ),
        }))
        .toSorted((a, b) => b.score - a.score)
    const sameDay = byDate.get(receipt.date) ?? []
    const scored = best(sameDay)
    if (sameDay.length > 0 && scored.length === 0) {
      anomalies.push({
        file: receipt.file,
        kind: 'ambiguous-receipt',
        message: 'Every ledger line on this date already has a receipt.',
      })
      continue
    }
    if (scored.length === 1) {
      claim(scored[0]!.expense.line, receipt.file)
      continue
    }
    if (scored.length > 1) {
      const [first, second] = scored
      if (first!.score > 0 && first!.score > second!.score) {
        claim(first!.expense.line, receipt.file)
      } else {
        anomalies.push({
          file: receipt.file,
          kind: 'ambiguous-receipt',
          message: `Could be lines ${scored.map(({ expense }) => expense.line).join(', ')}.`,
        })
      }
      continue
    }
    const nearby = best(
      nearbyDates(receipt.date).flatMap((date) => byDate.get(date) ?? []),
    ).filter(({ score }) => score > 0)
    const [first, second] = nearby
    if (first && (!second || first.score > second.score)) {
      claim(first.expense.line, receipt.file)
    } else {
      anomalies.push({
        file: receipt.file,
        kind: nearby.length > 1 ? 'ambiguous-receipt' : 'unmatched-receipt',
        message:
          nearby.length > 1
            ? `Could be lines ${nearby.map(({ expense }) => expense.line).join(', ')}.`
            : 'No ledger line within 3 days.',
      })
    }
  }
  for (const expense of expenses) {
    if (!matches.has(expense.line)) {
      anomalies.push({
        line: expense.line,
        kind: 'no-receipt',
        message: `${expense.date} ${expense.vendor}: ${expense.description}`,
      })
    }
  }
  return { matches, anomalies }
}
