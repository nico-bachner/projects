import { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { S3Client } from 'bun'
import * as z from 'zod'

import { Overrides, parseLedger } from '../src/ledger'
import { migrationFiles } from '../src/migrations'
import {
  matchReceipts,
  receiptExtension,
  receiptTypes,
  type Extension,
} from '../src/receipts'
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

const parsedOverrides = Overrides.safeParse(
  values.overrides ? JSON.parse(readFileSync(values.overrides, 'utf8')) : {},
)
if (!parsedOverrides.success) {
  console.error(
    `Invalid overrides file:\n${z.prettifyError(parsedOverrides.error)}`,
  )
  process.exit(1)
}
const overrides = parsedOverrides.data
const ledger = parseLedger(readFileSync(ledgerPath, 'utf8'), overrides)
const files = readdirSync(receiptsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
const { matches, anomalies } = matchReceipts(ledger.expenses, files, overrides)

const receipts = new Map<
  number,
  StoredReceipt & { file: string; extension: Extension }
>()
for (const [line, file] of matches) {
  const extension = receiptExtension(file)
  if (!extension) {
    throw new Error(`Unsupported receipt file type: ${file}`)
  }
  const contents = readFileSync(path.join(receiptsDir, file))
  const sha256 = new Bun.CryptoHasher('sha256').update(contents).digest('hex')
  receipts.set(line, {
    file,
    extension,
    sha256,
    key: `receipts/${sha256}.${extension}`,
  })
}

const sql = importSql(ledger.expenses, receipts)
const database = new Database(':memory:', { strict: true })
for (const migration of migrationFiles()) {
  database.run(readFileSync(migration, 'utf8'))
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
  const env = z
    .object({
      S3_ACCESS_KEY_ID: z.string().min(1),
      S3_SECRET_ACCESS_KEY: z.string().min(1),
      S3_ENDPOINT: z.url(),
    })
    .safeParse(process.env)
  if (!env.success) {
    console.error(
      `Uploading needs an R2 key for the treasury bucket:\n${z.prettifyError(env.error)}`,
    )
    process.exit(1)
  }
  const bucket = new S3Client({
    bucket: 'treasury',
    accessKeyId: env.data.S3_ACCESS_KEY_ID,
    secretAccessKey: env.data.S3_SECRET_ACCESS_KEY,
    endpoint: env.data.S3_ENDPOINT,
  })
  for (const { file, key, extension } of receipts.values()) {
    if (await bucket.exists(key)) {
      continue
    }
    await bucket.write(key, Bun.file(path.join(receiptsDir, file)), {
      type: receiptTypes[extension],
    })
    console.log(`Uploaded ${file} to ${key}.`)
  }
}
