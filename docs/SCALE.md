# Scale contract

Target: 100,000 pages and 1,000,000 findings in one immutable scan. Persistence remains Prisma-only; pg-boss owns only its queue schema.

## Query inventory and index rationale

The repository-wide Prisma inventory covers dashboard/current snapshot (`src/lib/dashboard.ts`, `currentSiteSnapshot.ts`), Issues, reports/export, scan detail/comparison/grouping, tasks, alerts, retention, watchdog, dispatcher, and crawl/audit/finalize workers.

| Query path | Predicate/order | Supporting index or bound |
|---|---|---|
| Current/history scan | `siteId`, `status`, `scanType`, newest `finishedAt` | `Scan(siteId,status,scanType,finishedAt)` |
| Global trend/dispatcher | `status`, `scanType`, `startedAt`, stable `id` | `Scan(status,scanType,startedAt,id)`; 90-day/20k-scan input cap |
| Watchdog scan leases | `status` + `updatedAt`/`leaseExpiresAt` | two matching Scan indexes |
| Crawl frontier/watchdog | `scanId`, `status`, `depth`, stable `id`; global expired leases | `Page(scanId,status,depth,id)`, `Page(status,leaseExpiresAt)` |
| Heavy audit sample | `scanId`, `audited`, lowest performance score | `Page(scanId,audited,perfScore,id)` |
| Page identity | normalized URL within scan | nullable SHA-256 `urlHash`, unique with `scanId`; historical rows remain immutable |
| Finding filters/groups/export | `scanId` + category/severity/code/fingerprint | existing category/severity and filter indexes plus `(scanId,code,id)` and `(scanId,fingerprint)` |
| Link cleanup/list | source page; scan + broken + cursor | `sourcePageId` FK/index and `(scanId,broken,id)` |
| Tasks/item checks | status/due, `siteId`, `assigneeId`, finding/site FK, expired lease | explicit FK and lease indexes |
| Alerts | level/read + newest cursor | existing read index plus created/level cursor indexes |
| Uptime | per-site range and global retention cutoff | existing `(siteId,checkedAt)` plus global `(checkedAt)` |

Raw `Page.url` is no longer indexed. Every new URL is normalized before insertion and receives a 64-character SHA-256 identity, avoiding PostgreSQL btree entry-size failures while retaining the full URL for display and fetches. Link retries delete by `sourcePageId`, not a large source URL.

## Query-count and memory envelopes

- Current snapshots are portfolio-batched: site/latest-crawl, matching page audits, and severity rollups are constant-query operations rather than three queries per site.
- Dashboard trends read at most 20,000 compact Scan summaries from the last 90 days and emit daily points (per-scan points only for a single-day demo history).
- Task KPIs use one `groupBy` plus two `count` queries; no Task rows enter dashboard memory.
- Finding groups aggregate by rule in PostgreSQL. Only 20–24 representative rows and at most eight pages/three snippets per displayed rule are loaded.
- Scan/page/link/task/alert API batches are capped at 200–500 rows and expose an opaque row-id cursor. CSV exports retain one 1,000-row batch plus encoded output chunks, and never build the full file in memory.
- Watchdog recovery emits at most 2,000 page jobs per sweep. Retention deletes at most 20 scans per batch and 25 batches per sweep.
- Fingerprint backfill holds 500 compact findings and 500 updates per transaction. Finalized scans use stable SHA-256 fingerprints indexed by `(scanId,fingerprint)` for database grouping/comparison.

Expected application heap is therefore proportional to a UI/export batch, rule count, active-site count, or the explicit trend caps—not total Page/Finding cardinality. The crawler frontier itself remains durable in PostgreSQL.

## Connection budget

Defaults are app Prisma 8, worker Prisma 12, and pg-boss 5 connections, with a 10-second Prisma pool timeout. `DATABASE_URL` parameters override Prisma defaults. Capacity planning must multiply each budget by its process/replica count and leave PostgreSQL headroom for migrations and administration.

## Fixture and verification

`npm run seed:scale` creates one 100k-page/1m-finding immutable scan in bounded 1,000-row batches. Override with `AUDITLY_SCALE_PAGES`, `AUDITLY_SCALE_FINDINGS`, and `AUDITLY_SCALE_BATCH_SIZE`. The `.invalid` origin prevents accidental crawling; the script inserts history directly through Prisma.

For a quick local smoke fixture, use `AUDITLY_SCALE_PAGES=1000` and `AUDITLY_SCALE_FINDINGS=10000`. Record wall time and peak RSS externally for the deployment hardware; database/cache state makes hard-coded timing claims misleading.
