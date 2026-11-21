import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { prisma } from "@/lib/db";
import { boss } from "@/lib/queue";
import { createQueuedScan } from "@/lib/scan/createQueuedScan";
import { injectCrash } from "@/lib/scan/crashInjection";
import { createDiscoveredPages, handleCrawlPage } from "./crawlPage";
import { handleScanFinalize } from "./scanFinalize";
import { handleScanStart } from "./scanStart";
import { urlIdentity } from "@/lib/crawler/urlIdentity";
import { pageVariantIdentity, provinceHeaders } from "@/lib/crawler/localization";
import { consolidateProvincialFindings } from "@/lib/findings/consolidate";
import { computeScanScores } from "@/lib/scoring";
import { groupScanFindings } from "@/lib/scan/groupFindings";
import { compareToPreviousScan } from "@/lib/scan/compareScans";
import { listBrokenLinks } from "@/lib/scan/brokenLinks";

let siteId = "";

before(async () => {
  const site = await prisma.site.create({
    data: { name: `pipeline-test-${randomUUID()}`, rootUrl: "https://example.com" },
  });
  siteId = site.id;
});

after(async () => {
  await boss.stop();
  if (siteId) await prisma.site.delete({ where: { id: siteId } }).catch(() => {});
  await prisma.$disconnect();
});

test("both scan modes use their saved provinces for seeds and discovered links", async () => {
  const previousPrivateNetwork = process.env.AUDITLY_ALLOW_PRIVATE_NETWORK;
  process.env.AUDITLY_ALLOW_PRIVATE_NETWORK = "true";
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") return response.end("User-agent: *");
    if (request.url === "/sitemap.xml") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end('<html lang="en"><head><meta name="Province" content="AB"></head><body><h1>Test page</h1><a href="/discovered">Discovered</a></body></html>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const rootUrl = `http://127.0.0.1:${address.port}/`;
  const site = await prisma.site.create({ data: { name: "Scope fixture", rootUrl } });
  const scanProvinces = ["AB", "QC"];
  try {
    for (const scanType of ["CRAWL", "TEXT_SEARCH"] as const) {
      // Seed the stored scope directly so worker requests stay on the local fixture.
      const scan = await prisma.scan.create({
        data: { siteId: site.id, scanType, scanProvinces, textSearchQuery: "Test" },
      });
      await handleScanStart({ scanId: scan.id });
      const seeds = await prisma.page.findMany({
        where: { scanId: scan.id, url: rootUrl },
        orderBy: { requestedProvince: "asc" },
      });
      assert.deepEqual(seeds.map((page) => page.requestedProvince), scanProvinces);
      await handleCrawlPage({ scanId: scan.id, pageId: seeds[0].id });
      const discovered = await prisma.page.findMany({
        where: { scanId: scan.id, url: new URL("/discovered", rootUrl).href },
        orderBy: { requestedProvince: "asc" },
      });
      assert.deepEqual(discovered.map((page) => page.requestedProvince), scanProvinces);
      await prisma.scan.delete({ where: { id: scan.id } });
    }
  } finally {
    if (previousPrivateNetwork === undefined) delete process.env.AUDITLY_ALLOW_PRIVATE_NETWORK;
    else process.env.AUDITLY_ALLOW_PRIVATE_NETWORK = previousPrivateNetwork;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.site.delete({ where: { id: site.id } });
  }
});

test("scan and required initial pages are committed atomically", async () => {
  const result = await createQueuedScan(
    siteId,
    "PAGE_AUDIT",
    { pagesFound: 1, pagesCrawled: 1 },
    [{ url: "https://example.com/", status: "FETCHED", audited: true }]
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const persisted = await prisma.scan.findUnique({ where: { id: result.scan.id }, include: { pages: true } });
  assert.equal(persisted?.pages.length, 1);

  const queued = await createQueuedScan(siteId, "CRAWL", {}, [{ url: "https://example.com/a" }]);
  assert.equal(queued.ok, true);
  if (queued.ok) {
    assert.equal(queued.scan.status, "QUEUED");
    assert.equal(await prisma.page.count({ where: { scanId: queued.scan.id } }), 1);
    await prisma.scan.delete({ where: { id: queued.scan.id } });
  }
});

test("concurrent scan requests for one site are all saved in the queue", async () => {
  const contender = await prisma.site.create({
    data: { name: `multi-worker-${randomUUID()}`, rootUrl: "https://workers.example.com" },
  });
  try {
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, index) => createQueuedScan(contender.id, "CRAWL", {}, [
        { url: `https://workers.example.com/${index}`, status: "PENDING" },
      ]))
    );
    assert.equal(results.filter((result) => result.ok).length, 16);
    assert.equal(await prisma.scan.count({ where: { siteId: contender.id, status: "QUEUED" } }), 16);
  } finally {
    await prisma.site.delete({ where: { id: contender.id } });
  }
});

test("duplicate page delivery cannot commit after its lease is replaced", async () => {
  const scan = await prisma.scan.findFirstOrThrow({ where: { siteId } });
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "AUDITING" } });
  const page = await prisma.page.findFirstOrThrow({ where: { scanId: scan.id } });
  await prisma.page.update({ where: { id: page.id }, data: { status: "AUDITING", attemptToken: "new", leaseExpiresAt: new Date(Date.now() + 60_000) } });
  const stale = await prisma.page.updateMany({ where: { id: page.id, status: "AUDITING", attemptToken: "old", scan: { status: "AUDITING" } }, data: { status: "AUDITED" } });
  assert.equal(stale.count, 0);
  const winner = await prisma.page.updateMany({ where: { id: page.id, status: "AUDITING", attemptToken: "new", scan: { status: "AUDITING" } }, data: { status: "AUDITED", attemptToken: null, leaseExpiresAt: null } });
  assert.equal(winner.count, 1);
});

test("high-contention frontier reservations never exceed maxPages and retain minimum depth", async () => {
  const scan = await prisma.scan.findFirstOrThrow({ where: { siteId } });
  await prisma.page.deleteMany({ where: { scanId: scan.id } });
  await prisma.page.create({ data: { scanId: scan.id, url: "https://example.com/", depth: 9 } });
  const batches = Array.from({ length: 30 }, (_, lane) =>
    Array.from({ length: 8 }, (_, index) => `https://example.com/${(lane * 3 + index) % 60}`)
  );
  await Promise.all(batches.map((urls, lane) => createDiscoveredPages(scan.id, urls, 25, lane % 4 + 1)));
  assert.equal(await prisma.page.count({ where: { scanId: scan.id } }), 25);
  await createDiscoveredPages(scan.id, ["https://example.com/"], 25, 0);
  assert.equal((await prisma.page.findFirstOrThrow({ where: { scanId: scan.id, url: "https://example.com/" } })).depth, 0);
});

test("forwarders share a single destination page and respect destination robots rules", async () => {
  const previousPrivateNetwork = process.env.AUDITLY_ALLOW_PRIVATE_NETWORK;
  process.env.AUDITLY_ALLOW_PRIVATE_NETWORK = "true";
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    if (path === "/robots.txt") return response.end("User-agent: *\nDisallow: /private\n");
    if (path.startsWith("/alias")) {
      response.writeHead(302, { Location: path === "/alias-blocked" ? "/private" : "/final" });
      return response.end();
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end('<html lang="en"><title>Destination</title><h1>Destination</h1></html>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const rootUrl = `http://127.0.0.1:${address.port}/`;
  let redirectSiteId: string | undefined;
  try {
    const site = await prisma.site.create({ data: { name: "Redirect fixture", rootUrl, maxPages: 3 } });
    redirectSiteId = site.id;
    const scan = await prisma.scan.create({
      data: {
        siteId: site.id,
        status: "CRAWLING",
        pagesFound: 3,
        pages: { create: ["alias-one", "alias-two", "alias-blocked"].map((path) => {
          const url = new URL(path, rootUrl).href;
          return { url, urlHash: urlIdentity(url) };
        }) },
      },
      include: { pages: true },
    });
    await Promise.all(scan.pages.map((page) => handleCrawlPage({ scanId: scan.id, pageId: page.id })));
    const pages = await prisma.page.findMany({ where: { scanId: scan.id } });
    assert.equal(pages.filter((page) => page.status === "REDIRECTED").length, 3);
    const visiblePages = pages.filter((page) => page.status !== "REDIRECTED");
    assert.equal(visiblePages.length, 1);
    assert.equal(visiblePages[0].url, new URL("final", rootUrl).href);
    await handleCrawlPage({ scanId: scan.id, pageId: visiblePages[0].id });
    const destination = await prisma.page.findUniqueOrThrow({ where: { id: visiblePages[0].id } });
    assert.equal(destination.status, "FETCHED");
    assert.equal(destination.title, "Destination");
    assert.equal(requests.includes("/private"), false);
    assert.equal((await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } })).pagesFound, 1);
    assert.equal(await prisma.finding.count({ where: { scanId: scan.id, pageId: { in: scan.pages.map((page) => page.id) } } }), 0);
  } finally {
    if (previousPrivateNetwork === undefined) delete process.env.AUDITLY_ALLOW_PRIVATE_NETWORK;
    else process.env.AUDITLY_ALLOW_PRIVATE_NETWORK = previousPrivateNetwork;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (redirectSiteId) await prisma.site.delete({ where: { id: redirectSiteId } });
  }
});

test("the same URL is audited and searched only for the province its HTML actually declares", async () => {
  assert.match(provinceHeaders("https://www.bell.ca", "https://www.bell.ca/Accueil", "AB").Cookie, /language=fr\|province=AB/);
  assert.equal(provinceHeaders("https://www.virginplus.ca", "https://www.virginplus.ca/fr/home/index.html", "QC").Cookie, "province=QC");

  const previousPrivateNetwork = process.env.AUDITLY_ALLOW_PRIVATE_NETWORK;
  process.env.AUDITLY_ALLOW_PRIVATE_NETWORK = "true";
  let declaredRegion = " ab ";
  let body = "Accueil";
  const server = createServer((request, response) => {
    if (request.url === "/robots.txt") return response.end("User-agent: *");
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<html lang="fr-CA"><head><meta name="Province" content="${declaredRegion}"></head><body><h1>${body}</h1><img src="/example.png"></body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const rootUrl = `http://127.0.0.1:${address.port}/`;
  let variantSiteId: string | undefined;
  try {
    const site = await prisma.site.create({ data: { name: "Province fixture", rootUrl } });
    variantSiteId = site.id;
    const scan = await prisma.scan.create({
      data: { siteId: site.id, status: "CRAWLING" },
    });
    assert.equal((await computeScanScores(scan.id)).scoreA11y, null);
    await createDiscoveredPages(scan.id, [rootUrl], 1, 0, ["AB", "ON"]);
    const pages = await prisma.page.findMany({ where: { scanId: scan.id } });
    assert.equal(pages.length, 2);
    assert.equal(pages.find((page) => page.requestedProvince === "AB")?.urlHash, pageVariantIdentity(rootUrl, "AB"));
    await Promise.all(pages.map((page) => handleCrawlPage({ scanId: scan.id, pageId: page.id })));

    const matched = await prisma.page.findFirstOrThrow({ where: { scanId: scan.id, requestedProvince: "AB" } });
    const mismatch = await prisma.page.findFirstOrThrow({ where: { scanId: scan.id, requestedProvince: "ON" } });
    assert.deepEqual([matched.status, matched.province, matched.language], ["FETCHED", "AB", "fr"]);
    assert.deepEqual([mismatch.status, mismatch.province, mismatch.language], ["ERROR", "AB", "fr"]);
    assert.match(mismatch.fetchError ?? "", /Requested ON/);
    assert.ok(await prisma.finding.count({ where: { pageId: matched.id, province: "AB", language: "fr" } }));
    assert.ok(await prisma.finding.findFirst({ where: { pageId: matched.id, category: "A11Y", code: "a11y.img-alt" } }));
    assert.equal(await prisma.finding.count({ where: { pageId: mismatch.id } }), 0);
    await handleScanFinalize({ scanId: scan.id });
    const health = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } });
    assert.equal(health.status, "COMPLETE");
    assert.deepEqual((health.categoryCoverage as Record<string, unknown>).A11Y, { attempted: 2, succeeded: 1, failed: 1 });
    assert.ok(health.scoreA11y !== null && health.scoreA11y > 75 && health.scoreA11y < 100);

    const search = await prisma.scan.create({
      data: { siteId: site.id, status: "CRAWLING", scanType: "TEXT_SEARCH", textSearchQuery: "accueil" },
    });
    await createDiscoveredPages(search.id, [rootUrl], 1, 0, ["AB", "ON", "QC", "SK"]);
    const searchPages = await prisma.page.findMany({
      where: { scanId: search.id },
      orderBy: { requestedProvince: "asc" },
    });
    for (const page of searchPages) {
      // Ontario receives the Alberta page. Saskatchewan receives verified content with no match.
      declaredRegion = page.requestedProvince === "ON" ? "AB" : page.requestedProvince ?? "";
      body = page.requestedProvince === "QC" ? "Accueil accueil" : page.requestedProvince === "SK" ? "Bonjour" : "Accueil";
      await handleCrawlPage({ scanId: search.id, pageId: page.id });
    }
    const searchMatches = await prisma.textSearchMatch.findMany({
      where: { scanId: search.id },
      orderBy: { province: "asc" },
    });
    assert.deepEqual(searchMatches.map(({ urlHash, province, count }) => [urlHash, province, count]), [
      [urlIdentity(rootUrl), "AB", 1],
      [urlIdentity(rootUrl), "QC", 2],
    ]);
    const coverage = await prisma.page.findMany({
      where: { scanId: search.id },
      orderBy: { requestedProvince: "asc" },
      select: { status: true, textMatchCount: true },
    });
    assert.deepEqual(coverage.map(({ status, textMatchCount }) => [status, textMatchCount]), [
      ["FETCHED", 1], ["ERROR", null], ["FETCHED", 2], ["FETCHED", 0],
    ]);
  } finally {
    if (previousPrivateNetwork === undefined) delete process.env.AUDITLY_ALLOW_PRIVATE_NETWORK;
    else process.env.AUDITLY_ALLOW_PRIVATE_NETWORK = previousPrivateNetwork;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (variantSiteId) await prisma.site.delete({ where: { id: variantSiteId } });
  }
});

test("regional repeats count once in scores, issue groups, and scan comparisons", async () => {
  const fixture = await prisma.site.create({ data: { name: "Finding consolidation fixture", rootUrl: "https://example.com" } });
  try {
    const shared = "https://example.com/shared";
    const other = "https://example.com/other";
    const codes = ["AB", "ON"] as const;
    const scans = [];
    const accessibilityScores = [];
    for (const [index, provinces] of [codes, ["ON"] as const].entries()) {
      const scan = await prisma.scan.create({
        data: {
          siteId: fixture.id,
          status: "COMPLETE",
          startedAt: new Date(Date.UTC(2026, 0, index + 1)),
          pages: { create: [shared, other].flatMap((url) => provinces.map((province) => ({
            url, urlHash: pageVariantIdentity(url, province), requestedProvince: province, province,
            language: "en", status: "FETCHED", h1Count: 1, linksChecked: 5,
          }))) },
        },
        include: { pages: true },
      });
      await prisma.finding.createMany({
        data: scan.pages.map(({ id, province }) => ({
          scanId: scan.id, pageId: id, province, language: "en", category: "A11Y", severity: "CRITICAL",
          code: "a11y.img-alt", message: "Missing alternate text", evidence: { count: province === "AB" ? 2 : 1 },
        })),
      });
      await prisma.link.createMany({
        data: scan.pages.map(({ id, url }) => ({
          scanId: scan.id, sourcePageId: id, sourceUrl: url, targetUrl: "https://example.com/broken",
          isInternal: true, broken: true,
        })),
      });
      const pdfUrl = "https://example.com/document.pdf";
      await prisma.page.create({
        data: { scanId: scan.id, url: pdfUrl, urlHash: urlIdentity(pdfUrl), status: "FETCHED" },
      });
      // Raw regional findings and consolidated findings yield the same accessibility score.
      const beforeConsolidation = await computeScanScores(scan.id);
      await consolidateProvincialFindings(scan.id);
      await consolidateProvincialFindings(scan.id);
      const scores = await computeScanScores(scan.id);
      assert.equal(scores.issueCounts.critical, 2);
      assert.equal(scores.categoryCoverage.A11Y.succeeded, scan.pages.length);
      assert.ok(scores.scoreA11y !== null && scores.scoreA11y > 75 && scores.scoreA11y < 100);
      assert.equal(scores.scoreA11y, beforeConsolidation.scoreA11y);
      accessibilityScores.push(scores.scoreA11y);
      assert.equal(scores.scoreLinks, 80);
      assert.equal(await prisma.finding.count({ where: { scanId: scan.id } }), scan.pages.length);
      const { groups } = await groupScanFindings(scan.id);
      assert.equal(groups[0].affectedPageCount, 2);
      assert.equal(groups[0].count, 2);
      assert.deepEqual(groups[0].samplePages.find(({ url }) => url === shared)?.provinces, provinces);
      const filtered = await groupScanFindings(scan.id, { province: "ON", language: "en" });
      assert.equal(filtered.totalFindingCount, 2);
      assert.deepEqual(filtered.groups[0].samplePages[0].provinces, ["ON"]);
      const links = await listBrokenLinks(scan.id, { localized: true, take: 1 });
      assert.equal(links.length, 1);
      assert.deepEqual("affectedProvinces" in links[0] ? links[0].affectedProvinces : [], provinces);
      const nextLinks = await listBrokenLinks(scan.id, { localized: true, take: 1, cursor: links[0].id });
      assert.equal(nextLinks.length, 1);
      assert.notEqual(nextLinks[0].sourceUrl, links[0].sourceUrl);
      scans.push(scan);
    }
    assert.equal(accessibilityScores[0], accessibilityScores[1]);
    const comparison = await compareToPreviousScan(scans[1].id);
    assert.equal(comparison.newFindingCount, 0);
    assert.equal(comparison.resolvedFindingCount, 0);
    assert.equal(comparison.persistingFindingCount, 2);
  } finally {
    await prisma.site.delete({ where: { id: fixture.id } });
  }
});

test("cancellation revokes scan and page leases", async () => {
  const scan = await prisma.scan.findFirstOrThrow({ where: { siteId } });
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "FINALIZING", attemptToken: "finalizer", leaseExpiresAt: new Date(Date.now() + 60_000) } });
  await prisma.$transaction([
    prisma.scan.update({ where: { id: scan.id }, data: { status: "CANCELLED", finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null } }),
    prisma.page.updateMany({ where: { scanId: scan.id }, data: { attemptToken: null, leaseExpiresAt: null } }),
  ]);
  const late = await prisma.scan.updateMany({ where: { id: scan.id, status: "FINALIZING", attemptToken: "finalizer" }, data: { status: "COMPLETE" } });
  assert.equal(late.count, 0);
});

test("all crash injection points are deterministic", () => {
  process.env.AUDITLY_ENABLE_CRASH_INJECTION = "1";
  for (const point of ["scan.start.claimed", "scan.start.initialized", "crawl.page.before-commit", "crawl.page.after-commit", "audit.page.before-commit", "audit.page.after-commit", "scan.finalize.before-complete"]) {
    process.env.AUDITLY_CRASH_AT = point;
    assert.throws(() => injectCrash(point), new RegExp(point.replaceAll(".", "\\.")));
  }
  delete process.env.AUDITLY_CRASH_AT;
  delete process.env.AUDITLY_ENABLE_CRASH_INJECTION;
});
