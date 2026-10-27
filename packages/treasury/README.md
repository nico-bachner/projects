# Treasury

Reimbursement claims and approvals for the Sydney University Canoe Club. Members claim through Discord, the treasurer approves, requests changes or rejects each claim, and the president and vice president sign off daily batches that are then emailed to Sydney Uni Sport (SUS).

This package so far holds the database schema and the one-off import of the old Google Sheets ledger. The Discord bot, batches and SUS emails come next.

## Storage

The `treasury` D1 database and R2 bucket are declared in [infra](../../infra/README.md). D1 is the source of truth and R2 holds receipts under `receipts/<sha256>.<ext>`. Backups are D1's 30-day point-in-time restore; anything older can be rebuilt from the receipts and the batches sent to SUS.

Schema changes are numbered SQL files in `migrations`. The Treasury workflow applies new ones to D1 when they reach `main`, and D1 records which have run. To try them against a local copy of the database:

```sh
cd packages/treasury
bunx wrangler d1 migrations apply treasury --local
```

`wrangler.jsonc` names the database for Wrangler.

Amounts are integer cents. Category, discipline, status and review decision are checked enums, and requesting changes or rejecting needs a note. Reviews start empty: expenses SUS already reimbursed are imported without approval history.

## Importing the ledger

The import takes the ledger exported from Google Sheets as CSV and a folder of the receipts downloaded from Drive, named `YYYY-MM-DD Item purchased.(png|pdf|jpg)`. Neither belongs in this public repository, and neither does the overrides file, since all three name members.

```sh
cd packages/treasury
bun run import ledger.csv receipts/ --overrides overrides.json
```

It writes `import/import.sql` and `import/report.md`, after loading the SQL twice into an in-memory copy of the schema to check that it applies and can be re-run. Read the report, add overrides, and repeat until it is clean.

- **Rows:** `Reimbursed` becomes `reimbursed` and `Pending` becomes `submitted`. Rows with a missing or unknown field are left out. Known misspellings of vendors and descriptions are corrected.
- **Duplicates:** rows with the same payer, amount, vendor and description are reported, as duplicates on the same date or as possible duplicates within 60 days.
- **Receipts:** a file matches the only ledger line on its date, or the line whose vendor and description best match its item name, then lines up to three days either side. Ties, second receipts for a line, unmatched files and lines without a receipt are reported.

Overrides are keyed by CSV line number, header being line 1. Any ledger field can be replaced, using the CSV's formats:

```json
{
  "rows": {
    "4": { "skip": true },
    "3": { "status": "approved" },
    "134": {
      "payer": "Name",
      "category": "Gear",
      "discipline": "N/A",
      "vendor": "Bunnings",
      "description": "Rope",
      "status": "reimbursed"
    }
  },
  "receipts": {
    "2026-03-16 SUSF Sports Awards.pdf": 55,
    "2026-03-16 Menu.pdf": null
  }
}
```

A receipt mapped to `null` is ignored. Expenses are keyed by line number, so export the ledger once and keep using that file.

When the report is clean, upload the receipts and apply the SQL. Uploads skip receipts already in R2 and read `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_ENDPOINT` (`https://<account id>.r2.cloudflarestorage.com`) for an R2 token with write access to `treasury`:

```sh
bun run import ledger.csv receipts/ --overrides overrides.json --upload
bunx wrangler d1 execute treasury --remote --file=import/import.sql
```

Re-running the import overwrites imported expenses, statuses included, so finish it before the bot starts taking claims.
