import * as z from 'zod'

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

export const Category = z.enum(categories)
export const Discipline = z.enum(disciplines)
export const Status = z.enum(statuses)

export type Category = z.infer<typeof Category>
export type Discipline = z.infer<typeof Discipline>
export type Status = z.infer<typeof Status>

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

const RowOverride = z.strictObject({
  skip: z.boolean().optional(),
  status: Status.optional(),
  date: z.string().optional(),
  payer: z.string().optional(),
  amount: z.string().optional(),
  category: z.string().optional(),
  discipline: z.string().optional(),
  vendor: z.string().optional(),
  description: z.string().optional(),
})

export const Overrides = z.strictObject({
  rows: z.record(z.string().regex(/^\d+$/u), RowOverride).optional(),
  receipts: z.record(z.string(), z.int().positive().nullable()).optional(),
})

export type Overrides = z.infer<typeof Overrides>

const LedgerRow = z.object({
  date: z.iso.date(),
  payer: z.string().min(1),
  amountCents: z
    .string()
    .regex(/^\$?(\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$/u)
    .transform((value) => Number(value.replace(/[$,.]/gu, ''))),
  category: Category,
  discipline: z
    .literal('N/A')
    .transform(() => null)
    .or(Discipline),
  vendor: z.string().min(1),
  description: z.string().min(1),
  status: z
    .enum(['Reimbursed', 'Pending'])
    .transform((value) => (value === 'Reimbursed' ? 'reimbursed' : 'submitted'))
    .or(Status),
})

const fieldNames: Record<string, string> = {
  amountCents: 'amount',
  status: 'reimbursed status',
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
    const result = LedgerRow.safeParse({
      date:
        override.date ??
        `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      payer: override.payer ?? payer,
      amountCents: override.amount ?? amount,
      category: override.category ?? category,
      discipline: override.discipline ?? discipline,
      vendor: override.vendor ?? vendor,
      description: override.description ?? description,
      status: override.status ?? reimbursed,
    })
    if (!result.success) {
      const problems = new Set(
        result.error.issues.map(({ path: [field] }) => {
          const name = String(field)
          return fieldNames[name] ?? name
        }),
      )
      anomalies.push({
        line,
        kind: 'invalid',
        message: `Missing or invalid ${[...problems].join(', ')}; not imported.`,
      })
      return
    }
    const values = result.data
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
      ...values,
      vendor: correctedVendor,
      description: correctedDescription,
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
