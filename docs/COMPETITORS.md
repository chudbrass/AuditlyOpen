# Auditly vs. the competition

Feature benchmark against the tools Auditly is modeled on, and what was added (or deliberately
skipped) as a result. Compared: **Siteimprove** (enterprise quality-assurance suite),
**ContentKing / Conductor Monitoring** (real-time SEO monitoring), **Lumar (DeepCrawl)** and
**Semrush/Ahrefs Site Audit** (crawler-based SEO audits), **Screaming Frog** (desktop crawler),
**UptimeRobot / Pingdom** (uptime monitoring).

## Feature matrix

| Capability | Siteimprove | ContentKing | Semrush/Ahrefs | Screaming Frog | Auditly |
|---|---|---|---|---|---|
| Multi-site portfolio dashboard | ✔ | ✔ | ✔ | ✖ (per-crawl) | ✔ |
| Broken-link checking | ✔ | ✔ | ✔ | ✔ | ✔ (fast tier, all pages) |
| SEO/metadata checks | ✔ | ✔ | ✔ | ✔ | ✔ (12 rules + site-wide duplicates) |
| Performance (Lighthouse/CWV) | ✔ | partial | ✔ | partial | ✔ (bounded heavy tier) |
| Accessibility (WCAG) | ✔ (core product) | ✖ | ✖ | partial | ✔ (axe-core, WCAG-mapped) |
| Score per category + overall | ✔ (DCI score) | ✔ | ✔ | ✖ | ✔ |
| Trends / history charts | ✔ | ✔ | ✔ | ✖ | ✔ (append-only scan history) |
| Scan scheduling | ✔ | ✔ (continuous) | ✔ | ✖ | ✔ (per-site cron) |
| Scan-to-scan comparison (new/resolved) | ✔ | ✔ | ✔ | partial | ✔ |
| Alerts / notifications | ✔ | ✔ | ✔ | ✖ | ✔ (persisted alert log) |
| Task/issue workflow | ✔ | ✖ | partial | ✖ | ✔ (kanban tasks, assignees) |
| Reports / exports | ✔ (PDF/CSV) | ✔ | ✔ | ✔ (CSV) | ✔ (report view + print + CSV) |
| Uptime / SLA monitoring | ✔ (add-on) | ✖ | ✖ | ✖ | ✖ |
| Team / roles | ✔ | ✔ | ✔ | ✖ | ✔ (members + roles, no auth yet) |
| Integrations (Slack/Jira/webhooks) | ✔ | ✔ | ✔ | ✖ | preview page (delivery TBD) |
| Self-hosted / own your data | ✖ | ✖ | ✖ | ✔ (desktop) | ✔ |

## Gaps closed in this round

- **Alerts** — persisted alert log (generated at scan completion: critical increases, health
  drops, coverage gaps, all-clear), with read/unread workflow.
- **Tasks** — lightweight issue workflow: kanban board, priorities, assignees, due dates,
  linkable to a finding code/page.
- **Reports** — per-site executive report (print → PDF) + findings CSV export.
- **Team** — member management with roles (display-level; no authentication yet).
- **Settings** — global crawler defaults, retention, notification toggles.
- **Integrations** — honest "coming soon" showcase (webhook delivery not implemented).

## Known gaps still open (roughly in order of value)

1. **Authentication/SSO** — everything is unauthenticated local; NextAuth is the planned path
   (see `docs/ARCHITECTURE.md` deployment notes).
2. **JavaScript-rendered crawling** — fast tier is HTTP+cheerio only; SPA content invisible
   outside the audited sample. Competitors: ContentKing partial, Lumar ✔.
3. **Notification delivery** — alerts exist in-app only; no Slack/email/webhook push yet.
4. **Content QA** — misspellings, readability, custom content policies (Siteimprove's QA module).
5. **Analytics integration** — traffic-weighted issue prioritization (Siteimprove/ContentKing).
6. **PDF report generation** — current report relies on browser print.
7. **Historical URL inventory** — page-level appear/disappear tracking across scans.
