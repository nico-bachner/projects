import { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { S3Client } from 'bun'

import { parseLedger, type Overrides } from '../src/ledger'
import { matchReceipts, parseReceiptName } from '../src/receipts'
import { report } from '../src/report'
import { importSql, type StoredReceipt } from '../src/sql'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    overrides: { type: 'string' },
    out: { type: 'string', default: 'import' },
    upload: { type: 'boolean', default: false },
  },
})

const [ledgerPath, receiptsDir] = positionals
if (!ledgerPath || !receiptsDir) {
  console.error(
    'Usage: bun run import <ledger.csv> <receipts-dir> [--overrides overrides.json] [--out dir] [--upload]',
  )
  process.exit(1)
}

const overrides: Overrides = values.overrides
  ? JSON.parse(readFileSync(values.overrides, 'utf8'))
  : {}
const ledger = parseLedger(readFileSync(ledgerPath, 'utf8'), overrides)
const files = readdirSync(receiptsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
const { matches, anomalies } = matchReceipts(ledger.expenses, files, overrides)

const receipts = new Map<number, StoredReceipt & { file: string }>()
for (const [line, file] of matches) {
  const contents = readFileSync(path.join(receiptsDir, file))
  const sha256 = new Bun.CryptoHasher('sha256').update(contents).digest('hex')
  const extension =
    parseReceiptName(file)?.extension ??
    path.extname(file).slice(1).toLowerCase()
  receipts.set(line, { file, sha256, key: `receipts/${sha256}.${extension}` })
}

const sql = importSql(ledger.expenses, receipts)
const database = new Database(':memory:', { strict: true })
const migrations = path.join(import.meta.dir, '../migrations')
for (const migration of readdirSync(migrations).toSorted()) {
  database.run(readFileSync(path.join(migrations, migration), 'utf8'))
}
database.run(sql)
database.run(sql)
const imported = database
  .query<{ count: number }, []>('SELECT count(*) AS count FROM expenses')
  .get()!.count
if (imported !== ledger.expenses.length) {
  throw new Error(
    `Expected ${ledger.expenses.length} expenses, found ${imported}.`,
  )
}

mkdirSync(values.out, { recursive: true })
await Bun.write(path.join(values.out, 'import.sql'), sql)
await Bun.write(
  path.join(values.out, 'report.md'),
  report(ledger.expenses, [...ledger.anomalies, ...anomalies], receipts.size),
)
console.log(
  `${ledger.expenses.length} expenses and ${receipts.size} receipts. Wrote ${path.join(values.out, 'import.sql')} and ${path.join(values.out, 'report.md')}.`,
)

if (values.upload) {
  const bucket = new S3Client({ bucket: 'treasury' })
  for (const { file, key } of receipts.values()) {
    if (await bucket.exists(key)) {
      continue
    }
    const source = Bun.file(path.join(receiptsDir, file))
    await bucket.write(key, source, { type: source.type })
    console.log(`Uploaded ${file} to ${key}.`)
  }
}
