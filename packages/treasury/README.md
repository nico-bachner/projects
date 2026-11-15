# Treasury

Reimbursement claims and approvals for the [Sydney University Canoe Club](https://usydcanoeclub.org). Members claim club spending through Discord, signatories review each claim, and approved claims are sent to [Sydney Uni Sport](https://susf.com.au) (SUS). Terms are defined in the [glossary](GLOSSARY.md).

This package so far holds the database schema and the one-off import of the old Google Sheets ledger. The schema predates the flow below and still models expenses rather than claims and line items. The Discord bot and SUS emails come next.

## Claim flow

The planned flow. Steps marked HITL need a person; the rest are automated.

1. **Upload (HITL, member).** The member uploads one or more receipts in Discord and writes the claim's purpose: what the spending was for, such as "Polo training BBQ". A claim can cover several receipts, such as the same kind of item bought from several stores on one day. A receipt belongs to at most one claim, so line items from one receipt can't be split across claims, and a claim cannot be made without one.
2. **Extract.** The bot reads each receipt's line items, vendor, date and total. A file already uploaded to any claim is refused, with a pointer to that claim. A receipt that looks like the same purchase as another, from any member, with the same vendor, date and total but a different file, is flagged: the member confirms it is a different purchase, and signatories see the flag and the matching claim. The bot also flags line items that don't sum to the printed total, which usually means a misread price, a missed line, a discount or a surcharge.
3. **Suggest.** Using the purpose, the bot suggests a category and disciplines for the claim and preselects the line items that fit it, across all its receipts.
4. **Confirm (HITL, member).** The member is first asked whether to claim every receipt in full. If not, they pick the line items to include. They confirm the total, category and disciplines. A line item can serve several disciplines, or General for the whole club, and can take a different category or disciplines when the receipt mixes them. Disciplines are a flat list, with no sub-disciplines. A claim whose receipts serve several purposes has one purpose that names them all.
5. **Notify.** Each signatory gets a Discord DM about the new claim, showing its purpose, total, and each receipt with its vendor and any line items left out.
6. **Review (HITL, signatories).** Each signatory approves, requests changes or rejects, whenever they have time. A change request objects to the claim's details, such as a wrong category or an included personal item, and a fix answers it. A rejection objects to the claim itself, such as personal spending, and no fix answers it. Both need reasons, which the bot DMs to the member along with what the claim still needs, since neither alone usually ends it. A signatory can change their own review later; a member who disagrees with a rejection DMs that signatory.
7. **Fix (HITL, member).** After a change request, the member fixes the claim. Adding a forgotten receipt to an open claim is also a fix. The same claim stays open; the fix dismisses its approvals and change requests, but not its rejections, and the signatories are notified again.
8. **Approve.** A claim is approved once three different signatories approve it, one of them the treasurer, even if the fourth requests changes or rejects it. A claim that can no longer reach that, after the treasurer's rejection or two from the others, is rejected, and the member gets one DM with every rejection's reasons. The member also gets one DM when the claim is approved, which tells them any open change request no longer applies; approved claims can no longer be fixed. Since the treasurer's approval is always needed, the treasurer's change request holds up the claim until it is fixed or the treasurer approves anyway. Signatories may approve their own claims.
9. **Submit (HITL, treasurer).** When the treasurer runs a Discord command, the bot emails every approved claim not yet submitted to SUS as one batch, so SUS isn't sent an email per claim. SUS cannot refuse them. Submitting counts as reimbursement: members are not notified, since their bank tells them. A member whose money never arrives escalates to the treasurer.

Out of scope for now: claims without a receipt, and grouping several members' claims for one event.

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
