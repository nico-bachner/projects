import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { ledgerCsv } from './fixtures'
import { parseLedger } from './ledger'
import { importSql } from './sql'

const migrate = (): Database => {
  const database = new Database(':memory:', { strict: true })
  const migrations = path.join(import.meta.dir, '../migrations')
  for (const migration of readdirSync(migrations).toSorted()) {
    database.run(readFileSync(path.join(migrations, migration), 'utf8'))
  }
  return database
}

test('imports into the schema and can be re-run', () => {
  const { expenses } = parseLedger(ledgerCsv)
  const sql = importSql(
    expenses,
    new Map([[2, { key: 'receipts/abc.pdf', sha256: 'abc' }]]),
  )
  const database = migrate()
  database.run(sql)
  database.run(sql)
  expect(database.query('SELECT count(*) AS count FROM members').get()).toEqual(
    { count: 3 },
  )
  expect(
    database
      .query(
        "SELECT m.name, e.amount_cents, e.receipt_key, e.status, e.source FROM expenses e JOIN members m ON m.id = e.member_id WHERE e.import_key = 'ledger:2'",
      )
      .get(),
  ).toEqual({
    name: 'Alex Smith',
    amount_cents: 16627,
    receipt_key: 'receipts/abc.pdf',
    status: 'submitted',
    source: 'import',
  })
  expect(
    database.query('SELECT count(*) AS count FROM expenses').get(),
  ).toEqual({ count: expenses.length })
})

test('requires a note when requesting changes or rejecting', () => {
  const database = migrate()
  database.run(importSql(parseLedger(ledgerCsv).expenses, new Map()))
  expect(() =>
    database.run(
      "INSERT INTO reviews (expense_id, member_id, decision) VALUES (1, 1, 'reject')",
    ),
  ).toThrow('CHECK constraint failed')
  database.run(
    "INSERT INTO reviews (expense_id, member_id, decision) VALUES (1, 1, 'approve')",
  )
})
