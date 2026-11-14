import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { categories, disciplines, statuses } from './ledger'

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)

const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((value) => `'${value}'`).join(', ')})`)

export const members = sqliteTable('members', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  discordId: text('discord_id').unique(),
})

export const batches = sqliteTable('batches', {
  id: integer('id').primaryKey(),
  createdAt: createdAt(),
  pdfKey: text('pdf_key'),
  submittedAt: text('submitted_at'),
  reimbursedAt: text('reimbursed_at'),
})

export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey(),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id),
    date: text('date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    vendor: text('vendor').notNull(),
    description: text('description').notNull(),
    category: text('category', { enum: categories }).notNull(),
    discipline: text('discipline', { enum: disciplines }),
    receiptKey: text('receipt_key'),
    receiptSha256: text('receipt_sha256'),
    status: text('status', { enum: statuses }).notNull(),
    batchId: integer('batch_id').references(() => batches.id),
    source: text('source', { enum: ['import', 'discord'] }).notNull(),
    importKey: text('import_key').unique(),
    discordThreadId: text('discord_thread_id'),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'expenses_date',
      sql`${table.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check('expenses_amount_cents', sql`${table.amountCents} > 0`),
    check('expenses_category', oneOf('category', categories)),
    check('expenses_discipline', oneOf('discipline', disciplines)),
    check('expenses_status', oneOf('status', statuses)),
    check('expenses_source', oneOf('source', ['import', 'discord'])),
    index('expenses_status').on(table.status),
    index('expenses_receipt_sha256').on(table.receiptSha256),
  ],
)

export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey(),
    expenseId: integer('expense_id')
      .notNull()
      .references(() => expenses.id),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id),
    decision: text('decision', {
      enum: ['approve', 'request_changes', 'reject', 'sign_off'],
    }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'reviews_decision',
      oneOf('decision', ['approve', 'request_changes', 'reject', 'sign_off']),
    ),
    check(
      'reviews_note',
      sql`${table.decision} IN ('approve', 'sign_off') OR ${table.note} IS NOT NULL`,
    ),
    index('reviews_expense_id').on(table.expenseId),
  ],
)
