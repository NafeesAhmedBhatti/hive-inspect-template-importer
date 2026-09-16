# samples/spectora — real export drop zone (provenance)

Drop **real** Spectora "Export to spreadsheet → Export HTML Text" `.xlsx`
files in this directory. The seed pipeline imports them through the same
parser as the upload flow.

## Provenance rules (enforced in code and docs)

- Files here are imported through `runImportParse` — the identical parser
  used by `POST /api/import/preview`. No special-casing.
- Templates created from these files keep `sourceFileName` = the original
  filename, so their origin is always auditable.
- **No real export ships with this repository.** Until someone with a
  Spectora account drops a file here, the repo contains zero real-export
  validation, and no documentation may claim otherwise.
- The demo template that appears when this directory is empty is clearly
  labeled synthetic: `isSynthetic = true`, `source = "synthetic_seed"`,
  name starts with "Hive Inspect — synthetic sample template", and every
  comment text is prefixed "Sample note:".

## Naming

Keep the original filename from Spectora (e.g. `4508151-home-inspection.xlsx`
style names are fine). The filename is stored verbatim as provenance.

## Contents of this directory

| File | What it is | Provenance |
| --- | --- | --- |
| `InterNACHI Residential -2026-09-16.xlsx` | **Real** Spectora "Export HTML Text" export. Template: **InterNACHI Residential**, loaded from Spectora's available template library (free trial, no customer data — stock InterNACHI content). Exported 2026-09-16. | Committed to the repo per assignment so reviewers test against the same file. Validated through the full gate in `tests/import-real-file.md` (status: CLOSED 2026-09-16). |

**Validation summary (2026-09-16):** 13 sections · 69 items · 392 comments ·
0 unknown columns · comment types mapped info 78 / defect 302 / limit 12 ·
categories mapped 0→281, 1→21 · 69 items ordered via `Order (w/i item)` ·
byte-for-byte HTML preserved · commit → tree → duplicate → delete all green
through the live API.
