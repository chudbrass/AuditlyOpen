# Auditly — Project guide for Claude Code

Auditly is a self-hosted, Siteimprove-style website scanner. It crawls multiple sites and tracks
broken links, performance, SEO/metadata, and (later) accessibility over time, with a charting dashboard.

**Read `docs/ARCHITECTURE.md` and `docs/DATA-MODEL.md` before writing code.** Build in the order set
by `docs/ROADMAP.md`; each phase has a spec in `prompts/`.

## Stack & conventions

- **Next.js (App Router) + TypeScript**, strict mode. React Server Components by default; `"use client"` only when needed.
- **PostgreSQL + Prisma** for all persistence. Never hand-write SQL; go through Prisma. Migrations via `prisma migrate`.
- **pg-boss** for background jobs (crawl + audit workers). No Redis.
- **Fast crawl tier:** `undici` for HTTP, `cheerio` for HTML parsing. Used for discovery, broken links, SEO.
- **Heavy audit tier:** `playwright` + `lighthouse` + (later) `@axe-core/playwright`. Runs on a bounded set of pages.
- **UI:** Tailwind CSS + Recharts. Keep components small and colocated.
- **Validation:** zod for all external input (API routes, form data, site config).

## Project structure (target)

```
src/
  app/                 # Next.js routes (dashboard pages + API route handlers)
  components/          # React UI components (cards, charts, tables)
  lib/
    db.ts              # Prisma client singleton
    queue.ts           # pg-boss singleton + job registration
    crawler/           # discovery + fast HTTP crawl
    audits/            # link-check, seo, performance (lighthouse), a11y (later)
    scoring.ts         # rolls raw findings into per-category scores
  workers/             # long-running pg-boss workers (crawl, audit)
prisma/
  schema.prisma
docs/
prompts/
```

The dashboard (Next.js) and the workers run as **separate processes** against the same Postgres DB.

## Commands (once scaffolded)

- `npm run dev` — Next.js dashboard (dev)
- `npm run worker` — background crawl/audit workers
- `npm run db:migrate` / `npm run db:studio` — Prisma migrate / studio
- `npm run lint` / `npm run typecheck`

## Guardrails

- **Respect crawl politeness:** obey `robots.txt`, cap concurrency, add per-host rate limits, set a
  descriptive User-Agent (`AuditlyBot`). Never crawl a domain the user hasn't added as a site.
- **Bound the heavy tier:** Lighthouse/axe must run on a configurable sample/priority set, never
  blindly on every page — a large site would take hours otherwise.
- **Scans are resumable & cancellable.** Crawl state lives in the DB, not just in memory.
- **Every scan is immutable history** — never overwrite prior scan results; the dashboard trends depend on it.
- Keep secrets in `.env` (gitignored). Provide `.env.example`.
