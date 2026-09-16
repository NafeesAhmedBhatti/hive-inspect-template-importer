# Deploying to Vercel + Supabase

This app is a standard Next.js 14 (App Router) project with a Prisma 5 /
PostgreSQL data layer. The dev container uses an embedded Postgres; for
production, Supabase is the intended database.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Note **two** connection strings from *Project Settings → Database*:
   - **Pooled** (PgBouncer, port `6543`) → for the app runtime
   - **Direct** (port `5432`) → for migrations

## 2. Configure Vercel environment variables

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | pooled string, `?pgbouncer=true&connection_limit=1` | runtime queries |
| `DIRECT_URL` | direct string | used by `directUrl`; migrations |

Both are documented in `.env.example`. Never commit real credentials.

## 3. Apply migrations

From your machine (or CI) with the env vars set:

```bash
npm ci
npx prisma migrate deploy
```

`prisma/migrations/` contains the full history; never edit applied
migrations — add new ones via `npx prisma migrate dev` locally and commit.

## 4. Deploy

```bash
vercel --prod
```

`vercel.json` already pins the framework and region defaults. The build runs
`next build`; `postinstall` runs `prisma generate`.

## 5. Seed (optional)

The seed is **idempotent** and provenance-first:

```bash
DATABASE_URL=<direct-or-pooled> DIRECT_URL=<direct> npx tsx scripts/seed.ts
```

- Real Spectora exports placed in `samples/spectora/*.xlsx` (in the deploy
  checkout) are imported through the real parser.
- With none present, it creates the clearly-labeled synthetic sample
  (`isSynthetic=true`) so the UI is explorable without fake provenance.

## 6. Post-deploy checklist

- [ ] `GET /api/health` returns `{"ok":true,"db":"connected"}` on the prod URL
- [ ] `/templates` loads (dashboard or empty state)
- [ ] Import a real export via `/import`; preview shows the preservation report
- [ ] Confirm the import; open the template; edit a name and reload — it persists
- [ ] Duplicate the template; verify the copy is independent (edit copy, source unchanged)

## Notes

- The embedded dev Postgres (`scripts/dev-postgres.mjs`, port 54329) is for
  local/container development only and is never used in production.
- File uploads are parsed in-memory; the 25 MB cap is enforced before parse.
