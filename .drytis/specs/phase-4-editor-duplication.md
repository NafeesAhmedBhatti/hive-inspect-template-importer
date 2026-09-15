# Phase 4 · Editor & duplication — structured editing, independent copies

## Goal
Desktop-first structured editor making hierarchy obvious; server-side transactional deep-copy
duplication with proven independence; all edits persisted and reload-surviving.

## Files
- `src/app/templates/[id]/page.tsx` + `src/components/editor/*` (tree, section/item/comment editors, save states)
- `src/app/page.tsx` dashboard: template list (counts, source, dates), import CTA, duplicate/delete
- `src/app/api/templates/[id]/route.ts`, `src/app/api/sections/[id]/route.ts`, `src/app/api/items/[id]/route.ts`, `src/app/api/comments/[id]/route.ts` (PATCH)
- `src/app/api/templates/[id]/duplicate/route.ts`
- `src/lib/services/templateService.ts` (tree read w/ ordering, field updates), `src/lib/services/duplicateService.ts`

## Editor contract
- Tree: Template → Section → Item → Comment, indented hierarchy, positions ordered.
- Inline edit: section name, item name, comment name, comment text (textarea; HTML allowed, sanitized preview).
- Save per node (PATCH) with success/error feedback; changes survive reload (server-persisted).
- Comment type/category badges visible; raw HTML never rendered unsanitized.
- Duplicate: button on dashboard + template page; copies name ("{name} (copy)"), all rows, `extra` verbatim; lands user in the copy; original untouched (no shared rows, new IDs).

## Acceptance criteria (what is true in the running app)
- [ ] Hierarchy is visually obvious (indented tree, counts shown)
- [ ] Editing a section/item/comment name+text and saving persists; visible after full reload
- [ ] Duplicate creates an independent copy; editing the copy never changes the original and vice versa
- [ ] Deleting a template (with confirm) removes it and its children
- [ ] Dashboard counts reflect actual DB content

## Tests
duplicateService unit/integration: deep-copy equivalence of structure+content, ID disjointness, edit-original-then-compare-copy (and reverse). templateService ordering tests. API route tests.
