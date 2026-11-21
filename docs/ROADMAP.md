# Auditly — Roadmap

Build in order. Each phase has a paste-ready prompt in `prompts/`. **Verify the acceptance criteria
before moving on** — later phases assume earlier ones work.

| Phase | Deliverable | Prompt |
|------:|-------------|--------|
| 0 | Scaffold: Next.js + TS + Tailwind + Prisma + Postgres + pg-boss, `.env`, base schema, worker skeleton | `prompts/phase-0-scaffold.md` |
| 1 | Sites CRUD + crawler (discovery, resumable, progress) | `prompts/phase-1-sites-crawler.md` |
| 2 | Broken-link checking (fast tier) | `prompts/phase-2-broken-links.md` |
| 3 | SEO / metadata checks (fast tier) | `prompts/phase-3-seo-metadata.md` |
| 4 | Performance diagnostics via Lighthouse (separate, one selected page) | `prompts/phase-4-performance.md` |
| 5 | Dashboard: homepage overview + per-site drilldown + charts | `prompts/phase-5-dashboard.md` |
| 6 | Scheduling + scan history/comparison | `prompts/phase-6-scheduling-history.md` |
| 7 | Accessibility (WCAG/ARIA static checks in the crawl tier) | `prompts/phase-7-accessibility.md` |

## Acceptance criteria per phase

### Phase 0 — Scaffold
- `npm run dev` serves an empty dashboard; `npm run worker` starts and connects to pg-boss.
- Prisma migrates the base schema to a local Postgres DB. `npm run db:studio` opens.
- `.env.example` documents `DATABASE_URL` and any config.

### Phase 1 — Sites + crawler
- Can add/edit/delete a site in the UI.
- "Run full crawl" enqueues a scan; a worker discovers pages (sitemap + link-following), respects
  `robots.txt`, include/exclude, and `maxPages`.
- Scan progress (found/crawled) updates live in the UI.
- Killing and restarting the worker mid-crawl resumes without losing progress or duplicating pages.

### Phase 2 — Broken links
- Every discovered page's links are checked (internal always; external if enabled), redirects followed.
- Broken links (status ≥ 400 or network error) stored with source page + status/error.
- Per-site broken-links table in the UI with counts.

### Phase 3 — SEO / metadata
- Each page yields SEO findings: missing/duplicate title, missing/long meta description, missing/multiple
  H1, heading-order jumps, images missing alt, missing canonical, missing `lang`, basic Open Graph.
- Findings stored with severity + evidence; SEO score computed.

### Phase 4 — Performance
- A popup lists/searches pages from the latest completed crawl and requires an explicit selection.
- Lighthouse runs on exactly that page, never as part of a regular crawl.
- Per-page performance score + key metrics (LCP, CLS, TBT) are stored without affecting site scores.

### Phase 5 — Dashboard
- Homepage: site count, aggregate score, open issues by category, trend charts across all sites.
- Per-site: current scores, score trend, issue breakdown, broken-links table, worst pages, scan history.
- Findings tables filter by category/severity/page and sort.

### Phase 6 — Scheduling + history
- Per-site cron schedule enqueues scans automatically; manual "Run full crawl" still works.
- Scan history list; compare a scan to the previous (new/resolved/persisting findings).

### Phase 7 — Accessibility
- Evidence-backed WCAG/ARIA checks run in the fast crawl tier across all fetched HTML pages.
- A11y findings and crawl score integrate with the other health categories.

## Working agreement for each phase

1. Re-read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`.
2. Implement only that phase; keep the two-tier split intact.
3. Document any changes to setup or verification commands.
4. Run `npm run lint` + `npm run typecheck` clean before declaring the phase done.
5. Manually verify the acceptance criteria (ideally against a small real site you own).
