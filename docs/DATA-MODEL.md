# Auditly — Data model

Sketch of the Prisma schema. Refine during Phase 0/1, but keep the shape: **findings are stored raw,
scores are derived, scans are append-only history.**

```prisma
// prisma/schema.prisma  (sketch)

model Site {
  id            String   @id @default(cuid())
  name          String
  rootUrl       String
  // crawl config
  seedUrls      String[] @default([])
  includePatterns String[] @default([])
  excludePatterns String[] @default([])
  maxPages      Int      @default(1000)
  concurrency   Int      @default(5)
  checkExternalLinks Boolean @default(true)
  // scheduling
  scheduleCron   String?  // null = manual only
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  scans          Scan[]
}

model Scan {
  id            String     @id @default(cuid())
  siteId        String
  site          Site       @relation(fields: [siteId], references: [id], onDelete: Cascade)
  scanType      ScanType   @default(CRAWL)    // CRAWL or PAGE_AUDIT
  status        ScanStatus @default(QUEUED)   // QUEUED, CRAWLING, AUDITING, COMPLETE, CANCELLED, FAILED
  startedAt     DateTime   @default(now())
  finishedAt    DateTime?
  // progress counters (updated live)
  pagesFound    Int        @default(0)
  pagesCrawled  Int        @default(0)
  pagesAudited  Int        @default(0)
  // derived summary (written at finalize for fast dashboard reads)
  scoreOverall     Int?
  scoreLinks       Int?
  scoreSeo         Int?
  scoreA11y        Int?
  issueCounts   Json?      // { critical: n, serious: n, moderate: n, minor: n }

  pages         Page[]
  findings      Finding[]
  links         Link[]

  @@index([siteId, startedAt])
}

model Page {
  id            String   @id @default(cuid())
  scanId        String
  scan          Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  url           String
  status        PageStatus @default(PENDING)  // PENDING, FETCHED, AUDITED, ERROR
  httpStatus    Int?
  depth         Int      @default(0)
  audited       Boolean  @default(false)      // was it selected for a page diagnostic
  // fast-tier extracted metadata
  title         String?
  metaDescription String?
  h1Count       Int?
  // standalone page-diagnostic score
  perfScore     Int?
  fetchedAt     DateTime?

  findings      Finding[]

  @@unique([scanId, url])
  @@index([scanId, status])
}

model Link {
  id            String   @id @default(cuid())
  scanId        String
  scan          Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  sourceUrl     String   // page the link was found on
  targetUrl     String
  isInternal    Boolean
  httpStatus    Int?     // final status after redirects
  broken        Boolean  @default(false)
  error         String?  // network/DNS error text if any

  @@index([scanId, broken])
}

model Finding {
  id            String   @id @default(cuid())
  scanId        String
  scan          Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  pageId        String?
  page          Page?    @relation(fields: [pageId], references: [id], onDelete: Cascade)
  category      Category // LINKS, SEO, PERFORMANCE, A11Y, QA, SECURITY
  severity      Severity // CRITICAL, SERIOUS, MODERATE, MINOR
  code          String   // stable rule id, e.g. "seo.missing-title"
  message       String
  evidence      Json?    // selector, snippet, expected/actual, etc.

  @@index([scanId, category, severity])
}

enum ScanStatus { QUEUED CRAWLING AUDITING COMPLETE CANCELLED FAILED }
enum ScanType   { CRAWL PAGE_AUDIT }
enum PageStatus { PENDING FETCHED AUDITED ERROR }
enum Category   { LINKS SEO PERFORMANCE A11Y QA SECURITY }
enum Severity   { CRITICAL SERIOUS MODERATE MINOR }
```

## Notes

- **Frontier/resume:** `Page` rows with `status = PENDING` *are* the crawl frontier. On restart the
  worker re-queries pending pages instead of relying on in-memory state.
- **History:** trends come from querying `Scan` rows over time per site; no mutation of old scans.
- **Scan type:** `CRAWL` scans are fast page inventory/link/SEO/QA/security/accessibility history;
  `PAGE_AUDIT` scans are separate one-page Lighthouse diagnostics selected from the latest completed
  crawl.
- **Trend performance:** the derived health summary fields on `Scan` (scores + `issueCounts`) let the
  dashboard chart history without scanning millions of `Finding` rows.
- **Performance isolation:** Lighthouse data lives on the diagnostic `Page`. It is not a scan score
  and is excluded from dashboard health metrics and trends.
- **pg-boss** creates its own schema/tables in the same database; keep them separate from app tables.
- Consider a `SiteMetricDaily` rollup table later if per-scan queries get slow at large history sizes.
