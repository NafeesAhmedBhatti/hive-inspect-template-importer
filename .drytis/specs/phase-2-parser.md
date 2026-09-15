# Phase 2 · Spectora parser — types, reader, parse, warnings

## Goal
Pure, UI-free, fully unit-tested parser turning Spectora HTML-text spreadsheets into a typed
intermediate representation with faithful hierarchy, text, and ordering — plus warning collection.

## Files
- `src/lib/spectora/types.ts` — ParsedTemplate/Section/Item/Comment, ImportWarning{level,code,message,context}, ImportResult
- `src/lib/spectora/columns.ts` — canonical column registry (official doc order), first-class vs verbatim classification
- `src/lib/spectora/readWorkbook.ts` — SheetJS read, header detection (case/whitespace-insensitive), row normalization
- `src/lib/spectora/parse.ts` — grouping (Section→Item→Comment), positions, warnings
- `src/lib/spectora/validate.ts` — pre-parse validation (extension, magic bytes, headers, required columns) with actionable errors
- `src/lib/spectora/sanitize.ts` — render-time allowlist HTML sanitizer
- `src/lib/spectora/__tests__/*.test.ts` + `fixtures/` (synthetic, labeled format-conformance fixtures)

## Parser contract
- Header row = first non-empty row; match canonical names case/whitespace-insensitively; unknown headers → warning (never crash).
- Required: `Section Name`, `Item Name`. Missing → hard error naming the absent columns.
- Grouping: consecutive runs of same section name, then same item name. Non-contiguous repeat of a section name → separate section (order-faithful) + info warning. Item row with empty section → "(Unfiled)" section + warning.
- Comment rows: name/text kept verbatim (HTML preserved). Both empty → skip row WITH warning (row number + section/item context).
- Ordering: row order authoritative; `Order (w/i item)` used for stable within-item sort when populated (ties keep row order) + info warning.
- Extra columns: stored per-comment verbatim into IR `extra`; unknown-but-populated columns → warning.
- `.xls` accepted with warning; other extensions → hard error.

## Acceptance criteria (parser behavior, verified by unit tests)
- [ ] Column reordering / missing optional columns / unknown columns parse without data loss
- [ ] Hierarchy and encounter-order positions match fixture expectations exactly
- [ ] Rich HTML in comment text survives byte-for-byte
- [ ] Empty comment rows produce warnings with location context, not silent drops
- [ ] Non-contiguous sections produce separate sections + info warning
- [ ] Missing required columns produce actionable hard errors
- [ ] All fixtures labeled synthetic format-conformance fixtures (never "real export")

## Tests
Vitest suites per behavior above; fixtures: minimal, reordered-columns, unknown-columns, noncontiguous, empty-rows, rich-content, order-column, xls-legacy. No test claims real-export validation — that gate is Phase 8 with the user's file.
