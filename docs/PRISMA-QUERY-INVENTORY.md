# Prisma query inventory

Inventory date: 2026-07-12. Search scope: `src/`, `scripts/`, and `prisma/seed.ts`; all persistence remains through Prisma (pg-boss manages its own schema).

| Area | Query owners | Scale-sensitive behavior |
|---|---|---|
| Dashboard | `lib/dashboard.ts`, `lib/currentSiteSnapshot.ts`, `app/page.tsx` | Latest snapshots are batched; categories/severities/tasks use `groupBy`/`count`; trend summaries are time- and row-bounded. |
| Issues | `app/issues/page.tsx` | Current scan ids are batched, result rows are paged, totals and top rules are database aggregates. Text `contains` filters remain intentionally unindexed because no PostgreSQL full-text/trigram extension is managed by Prisma here. |
| Reports | `app/reports/page.tsx`, `app/reports/[siteId]/page.tsx` | Report uses rule aggregates and bounded representatives, never all Finding records. |
| CSV export | `app/api/reports/[siteId]/csv/route.ts` | Stable id cursor, 1,000-row reads, streaming response, formula neutralization, private/no-store. |
| Scan detail/history | `app/sites/[id]/scans/[scanId]/page.tsx`, `app/api/sites/[id]/scans/route.ts`, `app/api/scans/[id]/*` | Scans/pages/broken links use cursor batches; counts/grouped findings stay in PostgreSQL; heavy pages are bounded by audit configuration. |
| Finding comparison/grouping | `lib/scan/compareScans.ts`, `lib/scan/groupFindings.ts`, `lib/findings/fingerprint.ts` | Finalization backfills fingerprints in 500-row transactions; comparison groups indexed fingerprints in PostgreSQL and fetches at most 50 representatives. |
| Scan creation | `lib/scan/createQueuedScan.ts`, `startScan.ts`, `startPageAuditScan.ts` | Atomic queued-scan creation; the worker admits the oldest queued scan globally, and performance scans validate one selected page from the latest completed crawl. |
| Crawl/audit workers | `workers/jobs/scanStart.ts`, `crawlPage.ts`, `auditPage.ts`, `scanFinalize.ts`, `resume.ts` | Frontier is durable; inserts/enqueues are chunked; per-page ownership is tokenized; link cleanup uses source-page FK; aggregate counters avoid healthy Link rows. |
| Dispatcher/watchdog | `workers/scanDispatcher.ts`, `workers/watchdog.ts` | Status/time indexes support claims; watchdog reads/refires at most 2,000 pages per sweep. |
| Retention | `workers/retention.ts` | Terminal scans are selected oldest-first and deleted in 20-scan batches; immutable surviving scans are never rewritten. |
| Tasks/item checks | `app/tasks/page.tsx`, `app/api/tasks/*`, `app/api/item-checks/*`, `workers/jobs/itemCheck.ts` | Task lists use 100-row cursors; KPI summary is aggregate-only; all nullable FK and lease predicates have indexes. |
| Alerts | `app/alerts/page.tsx`, `app/api/alerts/*`, `lib/scan/generateAlerts.ts` | 100-row newest-first cursor and unread count; retention targets read+time. |
| Settings/team/sites | `app/settings`, `app/team`, `app/api/sites`, `lib/workerStatus.ts` | Small configuration/cardinality tables; primary/unique key lookups dominate. Site deletion explicitly removes tasks and relies on indexed cascades. |
| Maintenance/fixtures | `scripts/rescore-history.ts`, `scripts/seed-scale.ts`, `prisma/seed.ts` | Rescore/fingerprint work is cursor-batched; scale fixture inserts bounded batches. Demo seed remains intentionally small. |

Deliberately rejected indexes: standalone Page depth/audited/status indexes (all hot reads are scan-scoped); standalone Finding category/severity/code (all production reads are scan-scoped); another Link target/source URL btree (unbounded URL text risks oversized index entries); and redundant FK indexes already covered as a leftmost prefix of a composite index.
