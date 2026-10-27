import { parseCsv } from './csv'

export const categories = [
  'Competitions',
  'Events',
  'Gear',
  'Merchandise',
  'Trips',
  'Website',
] as const

export const disciplines = ['Flatwater', 'Polo', 'Whitewater'] as const

export const statuses = [
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
  'signed_off',
  'submitted_to_sus',
  'reimbursed',
] as const

export type Category = (typeof categories)[number]
export type Discipline = (typeof disciplines)[number]
export type Status = (typeof statuses)[number]

export type Expense = {
  line: number
  date: string
  payer: string
  amountCents: number
  category: Category
  discipline: Discipline | null
  vendor: string
  description: string
  status: Status
}

export type Anomaly = {
  line?: number
  file?: string
  kind:
    | 'invalid'
    | 'duplicate'
    | 'possible-duplicate'
    | 'corrected'
    | 'no-receipt'
    | 'unmatched-receipt'
    | 'ambiguous-receipt'
  message: string
}

export type RowOverride = {
  skip?: boolean
  status?: Status
  date?: string
  payer?: string
  amount?: string
  category?: string
  discipline?: string
  vendor?: string
  description?: string
}

export type Overrides = {
  rows?: Record<string, RowOverride>
  receipts?: Record<string, number | null>
}

const header = [
  'YYYY',
  'MM',
  'DD',
  'Paid By',
  'Amount',
  'Category',
  'Discipline',
  'Vendor',
  'Description',
  'Reimbursed',
]

const vendorCorrections: Record<string, string> = {
  'Metro Petrolium': 'Metro Petroleum',
  'Norton Bakery Leichardt': 'Norton Bakery Leichhardt',
}

const descriptionCorrections: [RegExp, string][] = [
  [/\bEssenden\b/gu, 'Essendon'],
]

const parseAmount = (value: string): number | undefined => {
  const match = /^\$?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/u.exec(value.trim())
  if (!match) {
    return undefined
  }
  return Number(match[1]!.replaceAll(',', '')) * 100 + Number(match[2])
}

const parseDate = (
  year: string,
  month: string,
  day: string,
): string | undefined => {
  if (![year, month, day].every((part) => /^\d+$/u.test(part))) {
    return undefined
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return undefined
  }
  return date.toISOString().slice(0, 10)
}

const parseStatus = (value: string): Status | undefined => {
  if (value === 'Reimbursed') {
    return 'reimbursed'
  }
  if (value === 'Pending') {
    return 'submitted'
  }
  return undefined
}

const includes = <T extends string>(
  values: readonly T[],
  value: string,
): value is T => (values as readonly string[]).includes(value)

const dayDistance = (a: string, b: string): number =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

export const parseLedger = (
  text: string,
  overrides: Overrides = {},
): { expenses: Expense[]; anomalies: Anomaly[] } => {
  const [columns, ...records] = parseCsv(text)
  if (columns?.join(',') !== header.join(',')) {
    throw new Error(`Expected the ledger header: ${header.join(',')}`)
  }
  const expenses: Expense[] = []
  const anomalies: Anomaly[] = []
  records.forEach((record, index) => {
    const line = index + 2
    if (record.every((field) => field.trim() === '')) {
      return
    }
    const override = overrides.rows?.[String(line)] ?? {}
    if (override.skip) {
      return
    }
    const [
      year = '',
      month = '',
      day = '',
      payer = '',
      amount = '',
      category = '',
      discipline = '',
      vendor = '',
      description = '',
      reimbursed = '',
    ] = record.map((field) => field.trim())
    const values = {
      date: override.date ?? parseDate(year, month, day),
      payer: override.payer ?? payer,
      amountCents: parseAmount(override.amount ?? amount),
      category: override.category ?? category,
      discipline: override.discipline ?? discipline,
      vendor: override.vendor ?? vendor,
      description: override.description ?? description,
      status: override.status ?? parseStatus(reimbursed),
    }
    const problems = [
      values.date ? undefined : 'date',
      values.payer ? undefined : 'payer',
      values.amountCents ? undefined : 'amount',
      includes(categories, values.category) ? undefined : 'category',
      values.discipline === 'N/A' || includes(disciplines, values.discipline)
        ? undefined
        : 'discipline',
      values.vendor ? undefined : 'vendor',
      values.description ? undefined : 'description',
      values.status ? undefined : 'reimbursed status',
    ].filter((problem) => problem !== undefined)
    if (problems.length > 0) {
      anomalies.push({
        line,
        kind: 'invalid',
        message: `Missing or invalid ${problems.join(', ')}; not imported.`,
      })
      return
    }
    const correctedVendor = vendorCorrections[values.vendor] ?? values.vendor
    const correctedDescription = descriptionCorrections.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement),
      values.description,
    )
    for (const [from, to] of [
      [values.vendor, correctedVendor],
      [values.description, correctedDescription],
    ] as const) {
      if (from !== to) {
        anomalies.push({
          line,
          kind: 'corrected',
          message: `"${from}" → "${to}"`,
        })
      }
    }
    expenses.push({
      line,
      date: values.date!,
      payer: values.payer,
      amountCents: values.amountCents!,
      category: values.category as Category,
      discipline:
        values.discipline === 'N/A' ? null : (values.discipline as Discipline),
      vendor: correctedVendor,
      description: correctedDescription,
      status: values.status!,
    })
  })
  expenses.forEach((expense, index) => {
    for (const earlier of expenses.slice(0, index)) {
      if (
        earlier.payer !== expense.payer ||
        earlier.amountCents !== expense.amountCents ||
        earlier.vendor !== expense.vendor
      ) {
        continue
      }
      if (earlier.description !== expense.description) {
        continue
      }
      if (earlier.date === expense.date) {
        anomalies.push({
          line: expense.line,
          kind: 'duplicate',
          message: `Same date, payer, amount, vendor and description as line ${earlier.line}.`,
        })
      } else if (dayDistance(earlier.date, expense.date) <= 60) {
        anomalies.push({
          line: expense.line,
          kind: 'possible-duplicate',
          message: `Same payer, amount, vendor and description as line ${earlier.line}, within 60 days.`,
        })
      }
    }
  })
  return { expenses, anomalies }
}
