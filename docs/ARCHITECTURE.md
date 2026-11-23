# Auditly — Architecture

## Overview

Two processes, one database.

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Next.js dashboard  │        │   Worker process(es)     │
│  (UI + API routes)  │        │   (pg-boss consumers)    │
│                     │        │                          │
│  - manage sites     │ enqueue│  - crawl (discovery)     │
│  - view results     ├───────►│  - link-check (fast)     │
│  - trigger scans    │  jobs  │  - seo (fast)            │
│                     │        │  - Lighthouse (1 page)  │
└──────────┬──────────┘        │  - a11y (fast/static)    │
           │                   └────────────┬─────────────┘
           │  Prisma                        │  Prisma
           └───────────────┬────────────────┘
                           ▼
                   ┌───────────────┐
                   │  PostgreSQL   │  ← sites, scans, pages, findings, jobs (pg-boss)
                   └───────────────┘
```

The dashboard never does heavy work in a request. It only writes rows and **enqueues jobs**.
Workers do all crawling/auditing and write results back. The UI reads results and polls scan progress.

## Two-tier scanning (the core idea)

Running a headless browser on every page of a 1,000+ page site is infeasible. So checks split into:

### Fast tier — runs on ALL pages
- **HTTP crawl** with `undici` (keep-alive, high concurrency, rate-limited per host).
- **HTML parse** with `cheerio` (no browser).
- Produces: page inventory, broken links, SEO/metadata findings.
- Throughput: hundreds of pages/minute.

### Performance diagnostic — runs on ONE selected page
- **Playwright** (headless Chrome) + **Lighthouse**.
- The user selects one URL from the latest completed crawl in the performance dialog.
- It is a separate `PAGE_AUDIT`; it never delays a regular crawl or feeds health scoring/trends.

> Rationale for the split lives here so future changes don't accidentally push Lighthouse onto every page.

## Job pipelines

Scans are orchestrated sets of pg-boss jobs so they are resumable and observable. There are two
scan types:

- `CRAWL`: the fast scan. It discovers pages and runs link, SEO, and QA checks.
- `PAGE_AUDIT`: a standalone Lighthouse diagnostic for exactly one user-selected crawled page.

### Crawl scan

1. `scan.start` — create Scan row, read robots/sitemaps, seed the frontier.
2. `crawl.page` (fan-out, concurrency-capped) — fetch a URL, parse it, record the page, run fast-tier
   SEO checks, extract links, enqueue newly-discovered URLs on the exact configured hostname, and
   record link statuses. Bare and `www` hostnames are aliases; other subdomains are external.
   - Frontier + "seen" set live in DB (`Page` rows with status), so a restart resumes cleanly.
3. `scan.finalize` — compute per-category scores via `lib/scoring.ts`, mark Scan complete, snapshot
   aggregate metrics for fast dashboard reads.

### Page-audit scan

1. `performance-scans` API lists pages from the latest completed crawl; the user selects one URL.
2. The API creates a `PAGE_AUDIT` containing exactly that page and `audit.page` runs Lighthouse.
3. The page stores its performance score and key metrics. Scan/category/overall scores remain null.

Cancellation: `scan.cancel` sets a flag; workers check it and stop enqueuing/processing for that scan.

## Concurrency & politeness

- PostgreSQL serializable claims enforce a global FIFO queue: exactly one scan is active across all
  sites, and every later manual or scheduled request remains `QUEUED` until earlier scans finish.
  Each `Site.concurrency` crawl-page limit remains enforced across worker processes.
- `lib/crawler/rateLimit.ts` combines request-start spacing/Crawl-delay with an in-flight host
  semaphore. Host state is process-local: the recommended production topology is one crawl worker
  process handling the serialized scan queue. If multiple crawl-worker processes are run,
  divide `AUDITLY_HOST_CONCURRENCY` across them; database-backed global/site/frontier/audit claims
  remain exact, but no local semaphore can impose an origin-wide ceiling across processes.
- Frontier insertion is a serializable count-and-insert reservation. It never exceeds `maxPages`,
  and rediscovery updates a URL to its minimum observed depth. Finalization recomputes exact page,
  audit, and link counters from durable per-page rows.
- Respect `robots.txt` (`robots-parser`), `Crawl-delay`, and `nofollow`/`noindex` where relevant.
- User-Agent: `AuditlyBot/1.0 (+https://your-host/about)`.

Performance diagnostics persist their source crawl and selected page. Audit pages use tokenized
leases; stale leases return to the durable queue. The development worker reserves a dynamic CDP
port. In production, the optional isolated Chromium service and the worker use the dedicated
loopback ports in the [server deployment guide](DEPLOYMENT.md#4-enable-browser-audits).

Link extraction records exact `linksDiscovered` and `linksChecked` per page. Work is deliberately
bounded to 200 unique eligible targets per source page; `linksChecked / linksDiscovered` exposes
precise truncation coverage instead of implying that every extracted target was checked.

## Scoring

- Raw findings are stored; scores are **derived** in `lib/scoring.ts`.
- Regular crawls score links, SEO, QA, security, and accessibility.
- Site overall score = weighted average (weights configurable, default equal).
- Because scores are derived, you can re-score history without re-crawling.
- Score version 3 treats unattempted checks and categories where every attempt failed as unavailable
  (`null`), never as 100. Each finalized scan persists attempted/succeeded/failed coverage and the
  source scan for every available category.
- Score version 5 measures accessibility as the share of severity-weighted rule checks without
  a recorded finding. The denominator is the built-in page accessibility rule weights multiplied
  by the number of unique audited HTML URLs. A rule contributes its weight once if it flagged the
  URL in any province. Failed fetches and non-HTML responses do not contribute to the score.
- The server-only current-site snapshot anchors on the latest completed `CRAWL`. `PAGE_AUDIT`
  performance results are standalone and excluded from current scores, findings, issue totals, and
  trends.
- `npm run rescore:history` is a dry run; add `-- --apply` to persist score-version upgrades and stable
  finding fingerprints without re-crawling.

## Tech decisions & alternatives

| Decision | Choice | Why |
|----------|--------|-----|
| Framework | Next.js App Router | One codebase for UI + API; RSC for fast data reads |
| DB | PostgreSQL + Prisma | Handles history/time-series; easy hosted migration; typed access |
| Queue | pg-boss | Postgres-backed — no Redis to install on Windows; jobs are durable & resumable |
| Fast crawl | undici + cheerio | Fast, low memory, no browser for the 95% case |
| Performance diagnostic | Playwright + Lighthouse | Industry-standard measurement on one selected page |
| Charts | Recharts | Simple declarative charts in React |
| Validation | zod | One schema layer for API + forms + site config |

**Rejected:** BullMQ (needs Redis), SQLite (weaker for concurrent workers + hosted-later goal),
crawling everything with Playwright (too slow at 1,000+ pages).

## Deployment

Run the production dashboard and worker against the same PostgreSQL database. See the
[server deployment guide](DEPLOYMENT.md) for configuration, service supervision, and HTTPS.
