# NOTES — engineering decisions, gotchas, postmortems

## 1. Embedded Postgres data corruption after container pause (postmortem)

**Symptom:** the `postgres` background service failed to start with
`could not read directory "base": Bad message`,
`FATAL: could not access status of transaction 1`,
`Could not open file "pg_multixact/offsets/0000": Bad message`.

**Root cause:** the container's filesystem returned `Bad message` (EIO-style)
on files created before a pause/resume cycle — the Postgres data dir
(`/workspace/.pgdata`) was corrupted at the filesystem level, unrecoverable
by Postgres crash recovery.

**Resolution:** since no seed had run and no user data existed, the data dir
was moved aside and Postgres re-initialized fresh. `rm -rf` fails on the
corrupted files too — `mv` + recreate works.

**Lesson:** treat `/workspace/.pgdata` as disposable dev state. Never store
anything valuable only there; real data belongs in the configured production
database (Supabase in this project's target topology).

## 2. SheetJS write-side entity quirk (affects fixtures only)

`XLSX.write` does **not** re-escape `&` on write: a cell containing
`&amp;` round-trips to `&`. Real Excel-authored exports are unaffected
(Excel escapes correctly on save). Consequence: parser fixtures avoid
entity-containing strings; the byte-for-byte HTML preservation test uses
entity-free markup, and entity *rendering* is covered in sanitizer tests.

## 3. Prisma column mapping must match the migration, exactly

Phase 1 shipped `schema.prisma` **without** `@map` annotations while the
committed migration created snake_case columns (`source_file_name`,
`import_summary`, …). Any non-trivial Prisma query failed with
`The column "sourceFileName" does not exist in the current database`. The
health endpoint (`SELECT 1`) could not catch this. `schema.prisma` now maps
every non-snake-case column and parity is verified with
`npx prisma migrate diff --from-migrations --to-schema-datamodel` → "No
difference detected".

## 4. Raw SQL identifiers are case-sensitive

Postgres folds unquoted identifiers to lowercase. The migration created
`"template_id"` (snake_case, via Prisma naming), so raw count queries must
write `sec."template_id"`, `it."section_id"`, `c."item_id"` — quoted and
snake_case. Unquoted `templateId` fails with `column does not exist` (P2010).
A single join query computes all three per-template counts.

## 5. `migrate diff` with `--shadow-database-url` pointing at your real DB

`prisma migrate diff --from-migrations` replays migrations into the shadow
database. Pointing the shadow URL at the real dev database applies the
migrations for real, leaving `migrate deploy` believing nothing is applied.
Recovery: `npx prisma migrate resolve --applied <migration>` to baseline.
Use a scratch database as the shadow URL.

## 6. Vitest results can be stale after filesystem corruption

After the FS corruption episode, vitest served stale transformed modules
(after editing source, runs reported old failures). `npx vitest run
--no-cache` (or clearing `node_modules/.vite`) restores truth. If test
results contradict a source file you just changed, distrust the cache first.

## 7. Grouping rules for Spectora rows (parser semantics)

- Spreadsheet row order is authoritative; positions are encounter order.
- Identical consecutive `Item Name` rows are ONE item; an item name that
  re-appears after other items in the same section starts a NEW item
  (order-faithful) with an info warning.
- Non-contiguous section repeats become separate sections (never merged).
- Item rows with no section land in "(Unfiled)" with a warning.
- Rows with empty Comment Name AND Text are skipped; a warning is emitted
  only when the row carried comment-like data (Type/Category), so clean
  comment-less items do not produce noise.

## 8. `Order (w/i item)` semantics

When populated on any comment of an item, the whole item's comments are
stable-sorted by the numeric order; rows without a value keep spreadsheet
row order after the ordered ones (ties keep row order). Partially-populated
order columns emit an info warning; non-numeric values emit a warning and
keep row order for that comment.

## 9. Security posture for stored HTML

Storage is verbatim; sanitization is render-time only, via a strict
allowlist (`sanitize-html`): no `script`/`style`/`iframe`, no event
handlers, no `javascript:` URLs, protocol-relative URLs blocked, links get
`rel="noopener noreferrer nofollow"`. `SanitizedHtml` is the single
sanctioned raw-HTML sink in the UI.

## 10. Transactional boundaries

Import commit, template delete, and duplication each run in a single
Prisma transaction. Rollback is verified by an integration test that
sabotages the last section (NOT NULL violation) and asserts nothing
committed. Duplication independence is proven by mutating the copy and
asserting the source unchanged.

## 11. Synthetic-vs-real labeling

`isSynthetic=true` is set ONLY by the seed's synthetic sample. The dashboard
shows a distinct "synthetic sample" provenance badge. Documentation and UI
copy must never claim real-export validation until the checklist in
`tests/import-real-file.md` has passed against the user's actual file.
