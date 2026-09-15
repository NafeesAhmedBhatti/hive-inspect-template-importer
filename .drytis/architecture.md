# Hive Inspect — Template Importer · Architecture

## System overview

Desktop-first Next.js app (App Router). All parsing and persistence happens server-side;
the browser only uploads a file and renders server-computed results.

```
Browser (React/Tailwind)
   │  multipart upload            │  REST (JSON)
   ▼                              ▼
Next.js API routes (Node runtime)
   ├─ validate.ts      file/format validation, actionable errors
   ├─ parse.ts         xlsx → normalized IR (pure, UI-free)
   ├─ report.ts        preservation report (absent vs unsupported vs imported)
   ├─ importService    transactional IR → Postgres persist
   ├─ templateService  tree reads, field updates
   └─ duplicateService transactional deep copy
   ▼
Prisma → PostgreSQL (local dev container / Supabase in production)
```

## Import pipeline (stages, all server-side)

1. **Upload** — multipart POST, size cap (25 MB), extension check.
2. **Validation** — extension, ZIP/xlsx magic bytes, header-row detection, required-column
   presence. Hard errors stop here with actionable messages.
3. **Parse** — `readWorkbook` (SheetJS) → raw rows; `parse` groups rows into
   Section → Item → Comment IR, assigning encounter-order positions; collects warnings.
4. **Intermediate Representation** (`src/lib/spectora/types.ts`):
   `ParsedTemplate`, `ParsedSection`, `ParsedItem`, `ParsedComment`,
   `ImportWarning { level: "info"|"warning"|"error", code, message, context }`,
   `ImportResult { ok, template, report, warnings }`.
5. **Report/warnings** — per-column classification: `imported_first_class` /
   `stored_verbatim` (into `Comment.extra` jsonb) / `absent_in_source` / `rich_content_detected`.
   Counts derive ONLY from actual parse results.
6. **Preview** — `POST /api/import/preview` runs stages 1–5, persists nothing, returns IR+report.
7. **Persist** — `POST /api/templates` commits the IR in one transaction.
8. **Editor** — structured tree UI; edits go through targeted PATCH endpoints.
9. **Duplicate** — server-side transactional deep copy (new rows, new IDs, same content/positions).

## Folder structure

```
/workspace
├── prisma/schema.prisma, migrations/
├── samples/spectora/            # real .xlsx lands here (committed fixture) + provenance README
├── scripts/seed.ts              # imports samples via the real parser
├── src/app/                     # pages: / (dashboard), /import, /templates/[id]
├── src/app/api/                 # templates, import/preview, sections|items|comments/[id],
│                                # templates/[id]/duplicate, health
├── src/components/{ui,dashboard,import,editor}/
├── src/lib/spectora/            # types, columns, readWorkbook, parse, validate, report, sanitize
├── src/lib/                     # db.ts (Prisma singleton), services/
├── src/lib/spectora/__tests__/  # Vitest unit tests (hermetic)
└── src/lib/spectora/__tests__/fixtures/  # labeled synthetic conformance fixtures
```

## API design

| Method & path | Purpose |
|---|---|
| `POST /api/import/preview` | parse uploaded xlsx → `ImportResult` + preservation report; **no persistence** |
| `POST /api/templates` | commit parsed IR (body = preview result ref) → created template id |
| `GET /api/templates` | list templates with section/item/comment counts |
| `GET /api/templates/[id]` | full tree (sections→items→comments ordered) |
| `PATCH /api/templates/[id]` | rename template |
| `POST /api/templates/[id]/duplicate` | transactional deep copy → new template id |
| `PATCH /api/sections/[id]` | rename section |
| `PATCH /api/items/[id]` | rename item |
| `PATCH /api/comments/[id]` | edit comment name/text |
| `GET /api/health` | liveness + DB connectivity probe |

## Parser strategy

- **Header detection**: first non-empty row; canonical column match case/whitespace-insensitive.
- **Required columns**: `Section Name`, `Item Name` (missing → hard error listing what's absent).
- **Grouping**: rows grouped into consecutive runs of identical section name, then identical
  item name within section. Non-contiguous duplicate section names → kept as separate sections
  (order-faithful) + info warning. Rows with item but no section → "(Unfiled)" section + warning.
  Never drop a row silently.
- **Comment identity**: `Comment Name` and `Comment Text` (HTML preserved verbatim); both empty →
  row skipped **with warning** (location context included).
- **Ordering**: spreadsheet row order is authoritative. If `Order (w/i item)` is populated for an
  item's comments, stable-sort by it within that item (row order preserved for ties) + info warning.
- **Rich content**: comment text stored exactly as exported (raw HTML). Rendering passes through
  an allowlist sanitizer; script/style/iframe are never executed. Iframes detected → counted in
  report, rendered as a link placeholder (documented limitation).
- **Unknown columns** (not in the canonical registry) → stored verbatim in `extra` + warning.
- Accepts `.xlsx` (primary) and legacy `.xls` (accepted + warning to prefer xlsx).

## Testing strategy

- Hermetic Vitest suites over synthetic fixtures (clearly labeled *format-conformance fixtures,
  not real exports*): column reordering, missing optional columns, unknown columns, non-contiguous
  sections, empty comment rows, rich-content cells, duplicate order values, BOM/CRLF headers.
- `tests/import-real-file.md` checklist: the moment the real .xlsx lands in `samples/spectora/`,
  the same suites run against it plus the manual 15-point assignment checklist.
- Integration script for importService/duplicateService against local Postgres (manual, dev only).

## Deployment

- Local/preview: container Postgres, Next.js on :3000 behind Caddy (registered background service).
- Production target: **Vercel + Supabase Postgres**. `vercel.json`, `.env.example`, migration and
  Supabase setup docs shipped; actual deploy executes when the user supplies account credentials.
  No fabricated deployment claims.
