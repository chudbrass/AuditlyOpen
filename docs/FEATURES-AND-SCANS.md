# Auditly — Features and Scans Breakdown

Auditly is a self-hosted website-governance platform with two primary scan modes, 64 full-crawl checks, a Lighthouse diagnostic, issue management, reporting, scheduling, and historical comparisons.

> **Current implementation note:** Older progress notes mention sampled axe/browser audits, privacy scans, and quick scans. Those were subsequently removed. The current implementation has only a full website crawl and a separate, one-page Lighthouse performance scan.

## 1. Primary scan modes

### A. Full website crawl

This is the main site-health scan.

It:

- Starts from the root URL, optional seed URLs, `robots.txt`, and XML sitemaps.
- Supports sitemap indexes and compressed sitemaps.
- Follows links to discover additional pages.
- Treats HTTP/HTTPS and the conventional `www`/bare hostname forms as aliases. Other subdomains
  are external and are never added to the crawl frontier or followed as page redirects.
- Applies include and exclude wildcard patterns.
- Enforces a configurable maximum page count.
- Respects `robots.txt`, crawl delays, host rate limits, and crawl concurrency.
- Runs link, SEO, accessibility, QA, spelling, and security checks.
- Stores every result as immutable scan history.
- Produces category scores, an overall health score, issue counts, coverage, and trends.

This scan uses `undici` and `cheerio`; it does not render JavaScript or run a browser on every page.

### B. One-page performance scan

This is an isolated Lighthouse diagnostic.

Workflow:

1. Complete at least one full crawl.
2. Open the performance dialog.
3. Search the pages found in the latest completed crawl.
4. Select exactly one page.
5. Run Lighthouse against that page.

Outputs:

- Lighthouse performance score from 0–100.
- Largest Contentful Paint (LCP).
- Cumulative Layout Shift (CLS).
- Total Blocking Time (TBT).
- First Contentful Paint (FCP).
- Speed Index.
- Performance error and timeout information.
- A `performance.poor` issue for scores below 50.
- A `performance.needs-improvement` issue for scores from 50–89.

Performance results intentionally do not affect:

- Site health score.
- Full-crawl issue totals.
- Site score trends.
- Current website-health findings.

This separation prevents an expensive browser audit from slowing full-site health scans.

## 2. Full-crawl checks

The current static rule registry contains 60 checks. Two duplicate-content checks and two broken-link checks are added outside the registry, giving 64 full-crawl checks in total.

### Broken links — 2 checks

- Broken internal links.
- Broken external links.

Behavior:

- Internal links are always checked.
- External links can be enabled or disabled per site.
- Redirects are followed.
- Network and DNS failures count as broken.
- Final HTTP responses of 400 or higher normally count as broken.
- `401`, `403`, and `429` do not count as definitively broken because they can represent authentication, bot blocking, or rate limiting.
- Transient `429`, `502`, `503`, and `504` responses are retried.
- Broken targets are grouped so the issue shows every source page where the link appeared.
- Up to 20 example source pages are attached to the issue.
- Exact discovered, checked, internal-checked, and broken-link counters are stored.
- Work is limited to 200 unique eligible link targets per source page, with coverage shown when truncation occurs.

### Accessibility and ARIA — 31 checks

#### WCAG Level A

- Images missing alternative text.
- Links without discernible names.
- Buttons without discernible names.
- Form fields without labels.
- Missing document language.
- Heading-level jumps.
- Empty headings.
- Missing skip-to-content link.
- Redundant `title` attributes.
- Clickable non-interactive elements without keyboard support.
- Media autoplaying with sound.
- Iframes without titles.
- Sensory instructions relying only on color, shape, or position.

#### WCAG Level AA

- Viewport settings that disable zoom.
- Generic link text such as “click here.”
- Meta refresh or automatic redirect.
- Select controls that automatically submit or navigate.
- Positive `tabindex` values.
- Invalid fields without an error description.
- Accessible names that do not contain the visible label.
- Large fixed-width layouts that may prevent reflow.

#### WCAG 2.2 AA

- Interactive targets that may be smaller than 24×24 pixels.
- Drag interactions without a single-pointer alternative.
- Authentication flows that appear to require cognitive puzzles.

#### ARIA

- Invalid ARIA roles.
- Invalid `aria-*` attributes.
- Focusable elements hidden with `aria-hidden`.
- Redundant roles on native HTML elements.
- Unlabelled or non-unique landmarks.
- Composite roles missing required children.
- Duplicate HTML IDs.

These are static, evidence-backed heuristics. They do not replace a browser-based accessibility audit, manual keyboard testing, screen-reader testing, or computed-style checks such as color contrast.

### SEO and indexing — 16 checks

#### Page-level SEO

- Missing page title.
- Missing meta description.
- Missing H1.
- Missing canonical URL.
- Cross-domain canonical URL requiring review.
- Page marked `noindex`.
- Missing viewport metadata.
- Non-descriptive URL slug.
- Multilingual page or site without `hreflang`.

#### Site-level SEO

- Missing `robots.txt`.
- `robots.txt` blocking search engines from the site.
- Missing XML sitemap.
- Empty sitemap.
- Cross-domain sitemap URLs.

#### Cross-page checks

- Duplicate page titles.
- Duplicate meta descriptions.

Several noisy SEO assumptions were deliberately removed, including:

- Fixed title-length limits.
- Fixed description-length limits.
- Requiring exactly one H1.
- Requiring Open Graph metadata everywhere.
- Requiring structured data everywhere.
- Arbitrary minimum word counts.

### Quality assurance and content — 7 checks

- HTTPS pages loading HTTP resources.
- Deprecated HTML elements.
- Data tables without header cells.
- Document or download links that do not identify their file type.
- Excessive inline styles.
- Content images without responsive `srcset`.
- Potential misspellings.

Spelling features:

- Can be enabled per site.
- Supports English and French dictionaries.
- Shows the flagged word and occurrence count.
- Site owners can add brand names, product names, jargon, and other valid terms to a per-site allowlist.
- Future scans ignore allowed terms.
- Historical scan findings remain unchanged.

### Security hygiene — 8 checks

- Missing HTTP Strict Transport Security.
- Missing `X-Content-Type-Options: nosniff`.
- Missing Content Security Policy.
- Missing clickjacking protection.
- Missing explicit Referrer Policy.
- Server software or version disclosure.
- Forms submitting to insecure HTTP destinations.
- External `target="_blank"` links without safe opener protection.

These are security-hygiene checks, not a penetration test or vulnerability scanner.

## 3. Site configuration

Each site supports:

- Display name.
- Root URL.
- Additional seed URLs.
- Include URL patterns.
- Exclude URL patterns.
- Maximum pages, from 1 to 100,000.
- Crawl concurrency, from 1 to 50.
- External-link checking toggle.
- Spelling toggle.
- Allowed spelling vocabulary.
- Manual or scheduled scans.
- Schedule timezone using an IANA timezone.
- Custom five-field cron expression.

Schedule presets include:

- Manual only.
- Hourly.
- Daily.
- Weekly.
- Custom cron.

Sites can also be reordered in the interface.

## 4. Scan processing and reliability

The dashboard and worker are separate processes sharing PostgreSQL.

The full-crawl lifecycle is:

```text
QUEUED → STARTING → CRAWLING → FINALIZING → COMPLETE
```

The performance diagnostic lifecycle is:

```text
QUEUED → STARTING → AUDITING → FINALIZING → COMPLETE
```

Other terminal states are `CANCELLED` and `FAILED`.

Reliability features include:

- PostgreSQL-backed job queue using pg-boss.
- Durable database crawl frontier.
- Resuming after worker or process restarts.
- Scan and page leases.
- Attempt tokens preventing stale jobs from committing.
- Bounded exponential retries.
- Dead-letter queue.
- Watchdog recovery for stalled work.
- Transactional cancellation.
- Accurate progress counters recomputed from durable page records.
- Global FIFO queue.
- Exactly one active scan globally; later manual and scheduled scans remain queued.
- Queue-position display.
- Worker heartbeat and offline warnings.
- Graceful worker shutdown.
- Safe recovery from duplicate job delivery.
- Stale Lighthouse lease recovery.
- Dynamically allocated browser debugging ports.

## 5. Scoring

Full crawls generate five health scores:

- Links.
- SEO.
- Accessibility.
- QA.
- Security.

Overall health is the average of available category scores. Unavailable or failed categories remain `null`; they are not treated as 100.

Scoring behavior:

- Links score is the percentage of checked links that are not broken.
- Other categories use severity-weighted issue density per successfully fetched page.
- Critical issue weight: 25.
- Serious issue weight: 15.
- Moderate issue weight: 7.
- Minor issue weight: 3.
- Scores are clamped between 0 and 100.
- Raw findings are stored separately from derived scores.
- Historical scans can be re-scored without crawling again.
- Score version, category coverage, and score provenance are stored.

## 6. Dashboard and analysis features

### Portfolio overview

- Average site-health score and change.
- Total site count.
- Total crawled pages.
- Total open issues and change.
- Critical issue count.
- Percentage of pages not scanned.
- Per-site health cards.
- Score rings.
- Historical sparklines.
- Active-scan state.
- Issue distribution by severity.
- Portfolio issue trends.
- Recent alerts.
- Recent scans.
- Site health distribution.
- Issues by category.
- Assigned-task summary.

### Site detail

- Overall health score.
- Links, SEO, accessibility, QA, and security scores.
- Change from the previous scan.
- Multi-category score trend.
- Severity distribution.
- Category issue breakdown.
- Current active-scan status.
- Scan history.
- Broken-links table.
- Page inventory.
- Fetch errors.
- Latest performance diagnostics.
- Lighthouse metrics and errors.

### Scan detail

- Score summary.
- Issues grouped by rule.
- Severity and category filters.
- Visitor impact.
- Responsible owner.
- Fix guidance.
- Offending HTML snippets.
- Affected pages.
- Documentation links.
- Broken-link details.
- New, resolved, and persisting issue comparison.
- Collapsible raw page inventory.

### Global Issues view

Filters include:

- Site.
- Category.
- Conformance level.
- Severity.
- Responsible role.
- Element type.
- Text search.

Each rule includes metadata such as:

- Stable rule ID.
- Rule name.
- Severity.
- WCAG reference where applicable.
- Responsible role: author, developer, or designer.
- Element type.
- Visitor impact.
- Fix instructions.
- Documentation URL.
- Evidence and offending-element examples.

There is also a Rule Reference page containing the complete registry.

## 7. Issue workflow

### Individual issue recheck

Each issue can be rechecked without launching a complete crawl.

Depending on the issue, Auditly:

- Re-fetches and statically checks the affected page.
- Rechecks a single broken-link target.
- Re-runs a site-level robots or sitemap check.
- Re-runs Lighthouse for a performance issue.

Results are stored as:

- Fixed.
- Still present.
- Failed or retryable error.

If a fix is confirmed, matching open or in-progress tasks are automatically marked complete.

Rechecks do not alter historical scans, site scores, or trends. Cross-page findings such as duplicate titles and descriptions require a whole-site comparison and cannot be individually rechecked.

### Remediation task board

- Kanban columns for Open, In Progress, and Completed.
- Low, Medium, High, and Urgent priorities.
- Assignees.
- Due dates.
- Overdue state.
- Link to site, page, and finding code.
- Create a task directly from an issue.
- Move, edit, assign, complete, and delete tasks.
- Filter by assignee.
- Automatically complete matching tasks after a successful issue recheck.

## 8. Alerts

Alerts are persisted after scan completion.

Current alert triggers include:

- Critical issue count increased.
- Critical issues found on the first scan.
- Overall health dropped by at least 10 points.
- More than 5% of discovered pages were not scanned.
- Total issue count decreased.
- Healthy scan with no critical issues.

Features:

- Alert levels: critical, warning, informational, and OK.
- Read and unread filters.
- Mark one alert as read.
- Mark all alerts as read.
- Alerts can be disabled globally.

## 9. History and comparisons

Every scan is append-only history.

Features include:

- Score trends over time.
- Issue trends over time.
- Scan history list.
- Comparison to the previous completed scan of the same type.
- New issues.
- Resolved issues.
- Persisting issues.
- Stable finding fingerprints.
- Page-specific matching.
- Site-wide rule matching.
- Historical re-scoring.
- Configurable retention period while preserving the latest completed scan.

## 10. Reports and exports

- Per-site report cards.
- Print-friendly executive report.
- Overall and category score rings.
- Severity breakdown.
- Top issues grouped by rule.
- Changes from the previous scan.
- CSV findings export.
- Formula-injection-safe CSV generation.
- Streaming export for large finding sets.

There is no dedicated generated-PDF system; the print report can be printed or saved as PDF by the browser.

## 11. Team and application settings

### Team metadata

- Add and remove team members.
- Roles displayed as Admin, Member, or Viewer.
- Assign tasks to members.
- Show open-task counts.

This is assignment metadata only. It is not true role-based access control.

### Global settings

- Crawler User-Agent.
- Default maximum pages for new sites.
- Scan retention period.
- Alert enable or disable setting.

### Integrations

The interface advertises future integrations such as:

- Slack.
- Microsoft Teams.
- Email.
- Webhooks.
- GitHub.
- Jira.

They are currently placeholders and are not connected.

## 12. Operational and security features

- Single shared instance password.
- Password-strength preflight.
- Fail-closed startup if the password is missing or weak.
- Same-origin protection for state-changing requests.
- SSRF protection.
- Private, loopback, link-local, and metadata-network blocking.
- DNS rebinding protection.
- DNS-pinned outbound HTTP connections.
- Redirect-hop validation.
- Browser and Lighthouse traffic routed through an address-validating proxy.
- Sitemap decompression capped at 10 MiB.
- Linear wildcard pattern matching to avoid regex attacks.
- `/api/health` liveness endpoint.
- `/api/ready` database and worker readiness endpoint.
- `/api/metrics` queue age, retry and job counters, and stalled-scan data.
- JSON worker logs.
- Worker leadership leases for scheduler, dispatcher, watchdog, and retention processes.
- Scale-oriented indexes and bounded queries targeting as much as 100,000 pages and one million findings.

## 13. Things intentionally not included

These should not accidentally appear in a rebuild prompt unless they are intentionally added:

- No automated fixing of target websites.
- No privacy scan category.
- No quick or pulse scan.
- No Lighthouse run across every page.
- No current browser-based axe audit.
- No JavaScript-rendered full-site crawl.
- No penetration testing.
- No native PDF generator.
- No email digests yet.
- No working third-party integrations.
- No real multi-user authentication or role-based access control.
- No automatic crawling of domains the user has not configured.

## 14. Recommended modules for another version

If the new version should be smaller, these are clean feature packages to choose from:

1. **Core crawler:** sites, discovery, robots, sitemap, filters, progress, and history.
2. **Link scanner:** internal and external broken links with source-page reporting.
3. **SEO scanner:** metadata, indexing, sitemap, robots, and duplicate-content checks.
4. **Accessibility scanner:** the 31 static WCAG and ARIA checks.
5. **Quality scanner:** HTML quality, responsive images, and optional spelling.
6. **Security scanner:** headers, insecure forms and resources, and opener protection.
7. **Performance diagnostic:** one-page Lighthouse.
8. **Dashboard:** health scores, issues, charts, and site drilldowns.
9. **Workflow:** issue filters, tasks, individual rechecks, and automatic task completion.
10. **Monitoring:** schedules and alerts.
11. **Reporting:** executive reports and CSV export.
12. **Production hardening:** durable queues, recovery, SSRF controls, metrics, and retention.

## 15. Suggested rebuild baseline

A focused first version could include:

- Multi-site management.
- Full HTTP crawl with robots, sitemap, and same-site link discovery.
- Broken-link, SEO, accessibility, QA, and security checks.
- Immutable scan history.
- Category scores and an overall score.
- Issue filtering and evidence.
- Manual and scheduled scans.
- A separate one-page Lighthouse diagnostic.
- Basic dashboard and scan comparison.

Tasks, alerts, reports, team metadata, integrations, and advanced production controls can then be added as independent phases.
