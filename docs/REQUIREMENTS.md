# Auditly — Requirements

## 1. Goal

A self-hosted alternative to Siteimprove for personal/team use: scan multiple websites for quality
issues, track them over time, and view everything on a dashboard. Local-first (runs on Windows),
but built on Postgres so it can move to a server later.

## 2. Scope

### In scope (v1)
- Manage multiple sites (add / edit / remove).
- Crawl each site to discover its pages (sitemap + link-following, up to 1,000+ pages).
- Core checks in v1:
  1. **Broken links** — internal & external, with status code and where they were found.
  2. **SEO / metadata** — title, meta description, H1 usage, heading order, image alt text,
     canonical tag, lang attribute, Open Graph basics, duplicate titles/descriptions.
  3. **Accessibility / quality / security** — static, evidence-backed checks on all crawled pages.
  4. **Performance** — a separate Lighthouse diagnostic on one user-selected crawled page.
- Store every scan as immutable history.
- Dashboard: homepage overview + per-site drilldown with charts and issue tables.
- Manual "Run full crawl" plus scheduled recurring scans.

### Later phases
- Multi-user auth + roles (for the hosted deployment).
- Spelling/content checks, email digests, CSV/PDF export.

### Out of scope
- Fixing issues automatically. Auditly reports; it does not edit target sites.
- Crawling sites the user does not own/control-list.

## 3. Functional requirements

### Sites
- FR-1: Add a site with a name and root URL. Optional: extra seed URLs, include/exclude URL patterns,
  max pages, crawl concurrency, and whether to check external links.
- FR-2: List sites with their latest scores and last-scanned time.
- FR-3: Edit and delete a site (deleting removes its scan history after confirmation).

### Crawling & scanning
- FR-4: Discover pages via `robots.txt` → `sitemap.xml` (incl. sitemap index) → same-origin link
  following, respecting include/exclude patterns and `max pages`.
- FR-5: Fast-tier link, SEO, QA, security, and static accessibility checks run on **all** discovered pages.
- FR-6: Performance is launched separately from a popup and runs Lighthouse on exactly one page
  selected from the latest completed crawl.
- FR-7: Scans run in the background with live progress (pages found / crawled / audited) and are
  **cancellable** and **resumable** after a restart.
- FR-8: Respect `robots.txt`, per-host rate limits, and a concurrency cap. Identify as `AuditlyBot`.

### Results & history
- FR-9: Each crawl produces health-category scores (0–100), issue counts by severity, and findings
  linked to the page and evidence. Performance diagnostics do not affect these metrics.
- FR-10: Scans are immutable; the latest scan is "current," older scans remain for trends.
- FR-11: Compare a scan to the previous one (new / resolved / persisting issues).

### Dashboard
- FR-12: Homepage shows: total sites, aggregate score, total open issues by category, and trend
  charts (scores over time, issues over time) across all sites.
- FR-13: Per-site page shows: current scores, score trend, issue breakdown by category & severity,
  broken-links table, worst-performing pages, and scan history.
- FR-14: Findings tables are filterable (by category, severity, page) and sortable.

### Scheduling
- FR-15: Per-site schedule (e.g. daily/weekly) that enqueues a scan automatically.
- FR-16: Manual "Run full crawl" button.

## 4. Non-functional requirements

- NFR-1 (Scale): handle 1,000+ pages per site without exhausting memory — stream/queue, don't load all in RAM.
- NFR-2 (Politeness): never overload a target; default concurrency ≤ 5 per host, configurable.
- NFR-3 (Resilience): a crashed/restarted worker resumes in-progress scans from DB state.
- NFR-4 (Portability): everything runs locally on Windows via `npm run dev` + `npm run worker`;
  only external dependency is Postgres (local or Docker).
- NFR-5 (Data integrity): scan history is append-only; deleting a site is the only destructive action.
- NFR-6 (Config over code): crawl limits, concurrency, and schedules are per-site settings.

## 5. Key domain rules

- A **Scan** is one run against one Site at a point in time.
- Scores are computed by `lib/scoring.ts` from raw findings, so scoring can evolve without re-crawling
  (store raw findings, derive scores).
- Severity levels: `critical`, `serious`, `moderate`, `minor` (aligns with axe for the a11y phase).
- Broken link = final HTTP status ≥ 400 (after following redirects) or a network/DNS failure.
