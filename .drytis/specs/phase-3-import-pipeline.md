# Phase 3 · Import pipeline — preview, report, persist

## Goal
Trust-building import flow: preview with counts + preservation report (the ONE product
improvement), then transactional persistence. No persistence during preview.

## Files
- `src/lib/services/importService.ts` — transactional IR → DB persist
- `src/lib/services/reportService.ts` — preservation report builder (per-column classification)
- `src/app/api/import/preview/route.ts` — multipart parse → ImportResult JSON (no persist)
- `src/app/api/templates/route.ts` — POST commit parsed IR; GET list with counts
- Report component lib: `src/components/import/*`

## Report contract (counts derive ONLY from real parsing)
- Totals: sections, items, comments, comment-type breakdown
- Per canonical column: `imported_first_class` | `stored_verbatim` (n populated) | `absent_in_source` (0 rows) | `rich_content_detected` (n cells with HTML tags)
- Unknown columns listed separately with row counts
- Warnings surfaced with location context; missing-in-source NEVER labeled as lost
- Hard parse failure → actionable error state (never a silent 200)

## Acceptance criteria
- [ ] Uploading a fixture shows real counts matching the file's content (hand-verifiable)
- [ ] Report distinguishes absent-in-source vs present-but-not-first-class vs rich content
- [ ] Preview persists nothing; canceling leaves DB untouched
- [ ] Confirming imports atomically; failure rolls back fully
- [ ] Invalid file → clear error UI with actionable message

## Tests
Unit tests for reportService classification; importService integration (persist → verify counts → rollback-on-failure case); API route tests for multipart handling and error shapes.
