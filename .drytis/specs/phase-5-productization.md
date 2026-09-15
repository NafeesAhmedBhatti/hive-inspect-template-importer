# Phase 5 · Productization — seed, resilience, docs, Vercel-ready

## Goal
Reviewer-ready: real parser-driven seed, failure UX hardening, full README/NOTES, git hygiene,
Vercel/Supabase deployment package. Honesty gates enforced.

## Files
- `scripts/seed.ts` — wipes + re-imports via the REAL parser; if `samples/spectora/*.xlsx` exists, imports it (source label = real export + filename); else creates one clearly-labeled placeholder template (`isSynthetic=true`, "SYNTHETIC — replace with real export" naming) so reviewers see structure immediately
- `samples/spectora/README.md` — provenance template: real export name, source (Spectora → Export to spreadsheet → Export HTML Text), how obtained, committed-fixture status
- `README.md` — 17 required sections (overview, problem, features, stack, architecture, schema, import pipeline, local setup, env vars, migrations, run, test, deployment, sample template info, limitations, AI tools, credits)
- `NOTES.md` — 11 required items (cuts+why, supported input, limitations, preservation/edits/duplication verification method, failure cases, dev time, credits, key decisions)
- `vercel.json`, `.env.example`, `docs/deploy-vercel.md` (exact Vercel + Supabase steps incl. connection pooling + migration command), `docs/hive-vs-binsr-notes.md` (only if user supplies access; otherwise honestly noted as not explored)
- `tests/import-real-file.md` — the gate checklist run when the real .xlsx lands

## Seed honesty rules
- Placeholder seed NEVER named/claimed as InterNACHI; visibly badged SYNTHETIC in UI.
- When the real export is committed: seed uses it, provenance README filled, `isSynthetic=false`, import-report snapshot stored in `templates.importSummary`.

## Acceptance criteria
- [ ] Fresh DB + `npm run db:seed` yields a browsable template imported through the real parser
- [ ] Seed content provenance is unambiguous in the dashboard UI
- [ ] README/NOTES contain every assignment-required section, no credential exposure
- [ ] Deploy docs are exact and sufficient for the user to complete Vercel+Supabase without guessing
- [ ] Full workflow passes: upload→preview→report→import→edit→reload→duplicate→independence→invalid-file error
- [ ] Git history reads as logical feature commits

## Tests
15-point manual checklist from the assignment executed against the preview URL; parser suites green; real-file gate checklist documented and pending the user's file.
