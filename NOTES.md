# NOTES — engineering decisions, gotchas, postmortems

## 0. Assignment deliverables (read this first)

### What we cut, and why (deliberate)

- **No LLM-based import mapping.** The mapping from Spectora's HTML-text
  export is fully documented and deterministic; a model would add a failure
  mode (invented sections, dropped rows, malformed output) without solving a
  real ambiguity. Deterministic parsing is verifiable; the assignment itself
  flags model-validation risk.
- **No user accounts / auth.** Out of scope by assignment; keeps the reviewer
  workflow one URL open away. (If hosted publicly, the deployment is open —
  acceptable for review purposes.)
- **No create-from-scratch template authoring.** The customer arrives with a
  tuned template; blank authoring does not serve that journey and two days
  are better spent on fidelity and editor polish.
- **No drag-and-drop reordering, no add/delete of sections/items in the
  editor.** The baseline requires *rename/edit + save*; structural editing is
  the first thing we would add next (schema already supports it — positions
  are plain integers).
- **No Binsr trial exploration.** Time went to the import fidelity gate and
  the preservation report instead; the comparison was optional and we
  documented the choice here rather than shipping a shallow one.
- **No scheduled jobs, exports, analytics, or decorative UI** — all explicitly
  out of scope.

### Supported input

- Exactly one format: Spectora **"Export to spreadsheet → Export HTML Text"**
  `.xlsx` (legacy `.xls` accepted with a warning to prefer xlsx). Cap: 25 MB.
- Required columns: `Section Name`, `Item Name`; all other documented columns
  optional, unknown columns preserved verbatim.

### Known limitations (honest list)

- **Real-export validation is still OPEN.** Every automated test runs on
  clearly-labeled *synthetic* format-conformance fixtures built from Spectora's
  published format docs. No real Spectora export has been run through the app
  yet — `tests/import-real-file.md` is the gate that must pass (and be
  committed) before any "works on real exports" claim. **This is the single
  biggest open risk**, and it is documented, not hidden.
- HTML inside comments is preserved byte-for-byte and sanitized only at
  render time with a strict allowlist. Embedded **iframes are not rendered**
  (shown as a link placeholder — counted in the preservation report). This is
  deliberate: no third-party frame execution inside the app.
- Comment *type* values outside info/limit/defect are kept and flagged
  `unknown` rather than coerced; same for non-numeric categories (kept in
  `extra`, warning emitted).
- A row that is not part of any section lands in a visible **"(Unfiled)"**
  section (order-faithful) instead of being dropped.
- The editor edits names, comment text, type, and category; it does not yet
  create or delete nodes (see cuts above).

### How we checked our work

- **39 Vitest tests** (parser conformance: column reordering, missing/unknown
  columns, messy headers, order semantics; service integration: transactional
  commit, full-rollback sabotage test, duplicate independence proof).
- `tsc --noEmit` clean; production build green; end-to-end API exercised on
  the live app (preview → commit → tree → duplicate → delete).
- The 15-point manual checklist in `tests/import-real-file.md` is the
  pre-registered gate for real-export fidelity claims.
- Postmortems below record what broke and how it was found (§1, §3, §5, §6).

### Time spent

Approximately **two focused days** of build time (assignment target was
"two focused days, hackathon style"), including product exploration,
parsing, persistence, editor/duplication, tests, and this documentation.
Roughly: exploration + scaffolding ~20%, parser + validation ~30%,
persistence + services ~20%, editor/duplication/dashboard ~20%,
docs/tests/hardening ~10%.

### Credits / what we built on

- **Next.js 14 (App Router), React 18, Tailwind CSS** — app framework
  (scaffolded with create-next-app; all app code is ours).
- **Prisma 5** — ORM/migrations; schema designed by us (4 models, see
  `.drytis/schema.md`).
- **SheetJS (`xlsx`, 0.20.3 from the official SheetJS CDN)** — workbook
  reading only; all parsing/grouping/reporting logic is ours
  (`src/lib/spectora/`).
- **sanitize-html** — battle-tested allowlist sanitizer for render time.
- **Vitest** — test runner. Everything else (parser, services, UI) is
  first-party code in this repo.

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

**Known leftover artifacts:** the same FS corruption left an undeletable
`prisma/_quarantine_migrations/` directory and once blanked `.gitignore`
(repaired and committed). Git only emits a warning for the untracked
corrupted dir; `prisma migrate` is unaffected (it lists only
`prisma/migrations/`). Leave such dirs in place — do not fight the FS.

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
