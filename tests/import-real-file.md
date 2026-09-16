# Real-export validation gate — run BEFORE claiming real-export support

> **Status: OPEN — no real Spectora export has been validated yet.**
> Every automated test in this repository uses clearly-labeled synthetic
> format-conformance fixtures. Until every box below is checked against a
> real file from the user's Spectora account, documentation and UI copy must
> NOT claim real-export validation.

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
- [ ] `POST /api/import/preview` returns `ok:true` (or a hard error that is genuinely a file problem, investigated and understood)
- [ ] Header row detected correctly (log `headerRowNumber` = the row with column titles)
- [ ] All documented columns matched: Section Name, Item Name, Comment Name, Comment Text, Comment Type, Category, Order (w/i item)
- [ ] Unknown columns (if any) appear in the preservation report as unknown_column with data preserved
- [ ] No `MISSING_REQUIRED_COLUMNS` / `NO_HEADER_ROW` false positives

### Fidelity (compare against the real spreadsheet + live template)
- [ ] Section count matches what you see in the export
- [ ] Item and comment counts match
- [ ] Comment order inside each item matches the export (spot-check 3 items, including one with Order values)
- [ ] Rich HTML comments render correctly (spot-check 3, including bold/lists/links) with no script/style/iframe execution
- [ ] Comment Type values from the real file map to info/limit/defect (or are reported as `unknown` in warnings — verify the count)
- [ ] Category values map to -1/0/1 (or warn + preserve in extra)
- [ ] Every verbatim column (Recommendation, defaults, photos, …) visible in the editor's "verbatim columns" sections

### Persistence + round-trip
- [ ] Import commits; template appears in `/templates` with correct counts
- [ ] Reload the editor — all edits and original content persist
- [ ] Duplicate the template; mutate the copy; source unchanged

### Documentation update (after all boxes pass)
- [ ] README.md "Real-export status" line updated
- [ ] NOTES.md §11 updated with the validation date and file used
- [ ] This file: status changed to CLOSED with date + evidence links

## Failure handling

If the real file trips a parser error or a fidelity box fails: capture the
warning codes + preservation report, reduce to a minimal fixture modeled on
the real file, fix the parser, add the fixture as a regression test — then
re-run this gate from the top.
