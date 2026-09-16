# Hive Inspect — Template Importer

Import Spectora "Export to spreadsheet → **Export HTML Text**" `.xlsx` files
into a structured, editable, persistent template library.

## What it does

1. **Upload** a Spectora HTML-text spreadsheet export (`.xlsx`).
2. **Preview** — the file is parsed server-side and you get a full preview:
   section/item/comment counts, a **preservation report** for every column,
   and row-level warnings. *Nothing is saved yet.*
3. **Import** — on confirm, the whole template commits in a single database
   transaction (all-or-nothing).
4. **Library** — browse templates with real counts and provenance, duplicate
   any template into an independent deep copy, or delete it.
5. **Edit** — open a template to edit section/item/comment names, comment
   text, type and category inline; edits persist immediately.

## Preservation honesty

Every column in the export is accounted for in the preservation report:

| Status | Meaning |
| --- | --- |
| Imported (editable) | Mapped to a first-class, editable field |
| Stored verbatim | Preserved on every comment, shown in the editor |
| Absent in source | Column was not in the file (or fully empty) — nothing lost |
| Rich content | Cells contain HTML; stored verbatim, rendered sanitized |
| Unknown column | Not in the documented format; data kept verbatim anyway |

Comment text is stored **byte-for-byte** as exported (raw HTML included) and
sanitized only at render time with a strict allowlist — scripts, styles,
iframes and event handlers can never execute.

> **Real-export status: NOT YET VALIDATED.** All automated tests use clearly
> labeled *synthetic* format-conformance fixtures. The parser has never run
> against a real Spectora export. See `tests/import-real-file.md` for the
> checklist that must pass before that claim changes.

## Tech stack

- **Next.js 14** (App Router, TypeScript) + **Tailwind CSS**
- **Prisma 5** → **PostgreSQL** (dev: embedded Postgres on port 54329;
  production target: Supabase — pooled + direct connections via env)
- **SheetJS (xlsx)** for workbook reading, **sanitize-html** for rendering
- **Vitest** unit + integration tests

## Quick start (dev)

```bash
npm install
npx prisma migrate deploy      # applies prisma/migrations
npm run db:postgres start      # embedded dev Postgres (port 54329)
npx tsx scripts/seed.ts        # optional: sample data (see provenance below)
npm run build && npm start     # production-shape server on :3000
```

Then open `/import` and drop a Spectora HTML-text export.

### Seed provenance

The seed is honest by design:

- Files you drop in `samples/spectora/*.xlsx` are imported **through the real
  parser** and keep their original filename as provenance.
- With no real files present, it creates exactly one clearly-labeled synthetic
  sample (`isSynthetic = true`, name prefixed "Hive Inspect — synthetic
  sample template", every comment prefixed "Sample note:").
- No real Spectora export ships with this repository.

## Project structure

```
prisma/schema.prisma              # Template → Section → Item → Comment (snake_case mapped)
src/lib/spectora/                 # the parser pipeline (pure, no I/O)
  columns.ts                      #   canonical column registry + header matching
  readWorkbook.ts                 #   extension/magic-byte gates, header detection
  parse.ts                        #   rows → Section→Item→Comment IR + warnings
  report.ts                       #   preservation report builder
  sanitize.ts                     #   render-time allowlist sanitizer
  validate.ts                     #   cheap pre-parse gates (size/extension)
src/lib/services/                 # DB services (each with integration tests)
  importService.ts                #   transactional persist
  templateService.ts              #   tree reads, counts, rename, delete
  duplicateService.ts             #   independent deep copy
  editorService.ts                #   validated field mutations
src/app/api/                      # REST endpoints (see API table below)
src/app/(pages)                   # / , /import , /templates , /templates/[id]
src/components/                   # dashboard + editor UI components
scripts/                          # dev-postgres.mjs, seed.ts
samples/spectora/                 # real-export drop zone (see its README)
tests/import-real-file.md         # the real-export validation gate
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/import/preview` | multipart `.xlsx` → parse → IR + report + warnings (**no persistence**) |
| GET | `/api/templates` | list with real section/item/comment counts |
| POST | `/api/templates` | commit a parsed IR in ONE transaction |
| GET | `/api/templates/[id]` | full ordered tree |
| PATCH | `/api/templates/[id]` | rename |
| DELETE | `/api/templates/[id]` | delete (cascade) |
| POST | `/api/templates/[id]/duplicate` | independent deep copy, `(copy)` suffix |
| GET | `/api/templates/[id]/tree` | tree via templateService |
| PATCH | `/api/sections/[id]` | rename section |
| PATCH | `/api/items/[id]` | rename item |
| PATCH | `/api/comments/[id]` | update name/text/type/category (validated) |
| GET | `/api/health` | service + DB probe |

## Tests

```bash
npx vitest run                     # unit (parser/sanitizer) + integration (DB services)
npx tsc --noEmit                   # typecheck
npm run build                      # production build must succeed
```

Parser tests cover: column reordering, missing/unknown columns, rich HTML
preservation, encounter-order positions, non-contiguous sections/items,
"(Unfiled)" items, empty-comment row warnings, `Order (w/i item)` stable
sorting, messy headers (BOM/CRLF/case/whitespace), and actionable hard
errors. Service tests prove transactional commit, full rollback, and
duplicate independence (mutate the copy → source unchanged).

## Deployment

See `docs/deploy-vercel.md` for Vercel + Supabase. Environment variables:

- `DATABASE_URL` — Postgres connection (Supabase: **pooled**, port 6543)
- `DIRECT_URL` — migrations connection (Supabase: **direct**, port 5432)
- `.env.example` documents both.
