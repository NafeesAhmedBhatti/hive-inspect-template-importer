# Phase 1 · Foundations — scaffold, DB, health

## Goal
Runnable Next.js + TS + Tailwind app, Prisma/Postgres schema migrated, health endpoint proves
DB connectivity, git history begins with logical commits.

## Files
- `package.json` (next, react, typescript, tailwindcss, prisma, @prisma/client, vitest, xlsx)
- `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`
- `prisma/schema.prisma` (models per `.drytis/schema.md`), initial migration SQL
- `src/lib/db.ts` (Prisma singleton), `src/app/api/health/route.ts`
- `src/app/layout.tsx`, `page.tsx` (placeholder), `globals.css`
- `vercel.json` (region + framework settings)

## Tasks
1. Scaffold app manually (no create-next-app bloat); strict TS.
2. Prisma schema + `prisma migrate dev`; apply to container Postgres.
3. `/api/health` returns `{ ok, db: true }` or 503 with error detail.
4. Register `web` background service: `npm run dev` (or `start` after build) on :3000; verify via preview URL.
5. `.env.example` documents DATABASE_URL (Supabase format in comments) — no secrets committed.

## Acceptance criteria
- [ ] Preview URL loads the app shell
- [ ] /api/health reports DB connected
- [ ] Migration applies cleanly to a fresh database
- [ ] No secrets in repo

## Tests
- Health endpoint returns ok; DB failure surfaces 503 (dev-only check by stopping DB is enough).

## Runtime bring-up (operational addendum)
- Two registered background services so both survive container pauses:
  1. `postgres` → `node scripts/dev-postgres.mjs start` — embedded Postgres 127.0.0.1:54329, db `hive_importer` (dev-only credentials, non-secret). The "already up" branch must attach a foreground keepalive, never `exit(0)` (service managers would restart-loop).
  2. `web` → bash: wait for PG (≤60s) → `npm install` once (sentinel `.deps-done`, gitignored; postinstall runs `prisma generate`) → `npx prisma migrate deploy` → `npm run build && npm run start` on :3000.
- Platform MySQL is intentionally unused; Postgres everywhere per architecture decision.
- Initial migration SQL committed and verified against a fresh `.pgdata` (drop + re-apply once).
- Verify `/` and `/api/health` through the preview URL; no secrets in tracked files.
