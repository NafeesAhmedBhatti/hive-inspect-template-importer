# Real-export validation gate — run BEFORE claiming real-export support

> **Status: CLOSED — 2026-09-16.** Validated against the real export
> `samples/spectora/InterNACHI Residential -2026-09-16.xlsx`
> (InterNACHI Residential, Spectora free trial, stock content, no customer data).
> Evidence below; parser fix that fell out of it: annotated-header matching
> (`Comment Type (info, limit, defect)`, `Category (-1: Low, 0: Med, 1: High)`)
> + photo-family extension to `Default Photo 4..10` — see
> `src/lib/spectora/__tests__/real-export-conformance.test.ts` (44/44 tests green).
> Every automated test in this repository uses clearly-labeled synthetic
> format-conformance fixtures in addition to this real-file gate.

## Why this gate exists

Spectora's export format is known from its published documentation, but
real exports vary: header ordering, extra columns, entity encoding in HTML
cells, checkbox/photo columns, multi-sheet workbooks, quote escaping. The
synthetic fixtures encode our *assumptions*; this gate tests the reality.

## Procedure

1. Obtain the real export: in Spectora, open the template →
   *Export to spreadsheet → Export HTML Text* → save the `.xlsx`.
2. Record provenance: original filename, export date, template name in
   Spectora, and whether it is a full template (not a partial export).
3. Drop the file in `samples/spectora/` (see that folder's README) **and**
   import it through `/import` in a dev environment.

## Checklist (all boxes required)

### Parse
- [x] `POST /api/import/preview` returns `ok:true` (or a hard error that is genuinely a file problem, investigated and understood)
- [x] Header row detected correctly (log `headerRowNumber` = the row with column titles)
- [x] All documented columns matched: Section Name, Item Name, Comment Name, Comment Text, Comment Type, Category, Order (w/i item)
- [x] Unknown columns (if any) appear in the preservation report as unknown_column with data preserved
- [x] No `MISSING_REQUIRED_COLUMNS` / `NO_HEADER_ROW` false positives

### Fidelity (compare against the real spreadsheet + live template)
- [x] Section count matches what you see in the export
- [x] Item and comment counts match
- [x] Comment order inside each item matches the export (spot-check 3 items, including one with Order values)
- [x] Rich HTML comments render correctly (spot-check 3, including bold/lists/links) with no script/style/iframe execution
- [x] Comment Type values from the real file map to info/limit/defect (or are reported as `unknown` in warnings — verify the count)
- [x] Category values map to -1/0/1 (or warn + preserve in extra)
- [x] Every verbatim column (Recommendation, defaults, photos, …) visible in the editor's "verbatim columns" sections

### Persistence + round-trip
- [x] Import commits; template appears in `/templates` with correct counts
- [x] Reload the editor — all edits and original content persist
- [x] Duplicate the template; mutate the copy; source unchanged

### Documentation update (after all boxes pass)
- [x] README.md "Real-export status" line updated
- [x] NOTES.md §11 updated with the validation date and file used
- [x] This file: status changed to CLOSED with date + evidence links

## Failure handling

If the real file trips a parser error or a fidelity box fails: capture the
warning codes + preservation report, reduce to a minimal fixture modeled on
the real file, fix the parser, add the fixture as a regression test — then
re-run this gate from the top.
