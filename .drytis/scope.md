# Hive Inspect — Template Importer · Scope

## In scope (P0)
- Upload + validation of Spectora HTML-text .xlsx exports
- Pure, UI-free parser → typed IR; faithful hierarchy/text/order preservation
- Import preview + preservation report (single product improvement; absent vs unsupported)
- Transactional persistence to PostgreSQL (Supabase-compatible schema via Prisma)
- Structured editor: rename sections/items, edit comment name/text; save + reload persistence
- Independent duplication (server-side transactional deep copy)
- Failure handling: invalid/malformed files → actionable errors, never silent
- Seed with the real InterNACHI Residential export (user-provided); until then, clearly-labeled
  placeholder seed marked `isSynthetic=true`
- Public preview deployment (workspace URL) now; Vercel-ready handoff (config/docs) until
  credentials are provided
- README.md + NOTES.md covering all 17/11 assignment points; meaningful git history

## Out of scope (per assignment)
Inspection report writing, scheduling, payments, homeowner-facing anything, mobile optimization,
CRM, analytics, real-auth complexity, decorative features. No localStorage persistence. No
hard-coded sample. No fabricated Spectora data or test claims.

## Explicit honesty rules
- No "validated against real export" claim until the user's real .xlsx is tested in the app.
- Synthetic test fixtures labeled as format-conformance fixtures, never as real exports.
- Deployment status reported accurately: workspace-preview live; Vercel = ready + instructions
  until account access exists.
- Every count in UI comes from actual parsing; missing source data never reported as lost.
