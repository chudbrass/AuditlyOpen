import { createHash } from "node:crypto";
import { prisma } from "../src/lib/db";
import { urlIdentity } from "../src/lib/crawler/urlIdentity";

const pageCount = Math.max(1, Number(process.env.AUDITLY_SCALE_PAGES) || 100_000);
const findingCount = Math.max(0, Number(process.env.AUDITLY_SCALE_FINDINGS) || 1_000_000);
const batchSize = Math.min(2_000, Math.max(100, Number(process.env.AUDITLY_SCALE_BATCH_SIZE) || 1_000));
const rootUrl = "https://scale-fixture.invalid";

async function main() {
  const site = await prisma.site.create({
    data: { name: `Scale fixture ${new Date().toISOString()}`, rootUrl, maxPages: pageCount },
  });
  const scan = await prisma.scan.create({
    data: { siteId: site.id, status: "CRAWLING", scanType: "CRAWL", pagesFound: pageCount },
  });

  for (let start = 0; start < pageCount; start += batchSize) {
    const end = Math.min(pageCount, start + batchSize);
    await prisma.page.createMany({
      data: Array.from({ length: end - start }, (_, offset) => {
        const n = start + offset;
        const url = `${rootUrl}/pages/${n}`;
        return { scanId: scan.id, url, urlHash: urlIdentity(url), status: "FETCHED" as const, httpStatus: 200, depth: n % 8, title: `Scale page ${n}`, fetchedAt: new Date() };
      }),
    });
    process.stdout.write(`\rpages ${end.toLocaleString()}/${pageCount.toLocaleString()}`);
  }

  let created = 0;
  let pageCursor: string | undefined;
  while (created < findingCount) {
    const pages = await prisma.page.findMany({
      where: { scanId: scan.id }, select: { id: true, url: true }, orderBy: { id: "asc" }, take: batchSize,
      ...(pageCursor ? { cursor: { id: pageCursor }, skip: 1 } : {}),
    });
    if (!pages.length) pageCursor = undefined;
    const activePages = pages.length ? pages : await prisma.page.findMany({ where: { scanId: scan.id }, select: { id: true, url: true }, orderBy: { id: "asc" }, take: batchSize });
    const rows = Math.min(batchSize, findingCount - created);
    await prisma.finding.createMany({
      data: Array.from({ length: rows }, (_, offset) => {
        const n = created + offset;
        const page = activePages[n % activePages.length];
        const code = `scale.rule-${n % 40}`;
        return { scanId: scan.id, pageId: page.id, category: "SEO" as const, severity: (["CRITICAL", "SERIOUS", "MODERATE", "MINOR"] as const)[n % 4], code, message: `Synthetic scale finding ${n}`, fingerprint: createHash("sha256").update(`${code}\n${page.url}\n${n % 3}`).digest("hex") };
      }),
    });
    created += rows;
    pageCursor = activePages.at(-1)?.id;
    process.stdout.write(`\rfindings ${created.toLocaleString()}/${findingCount.toLocaleString()}`);
  }

  await prisma.scan.update({ where: { id: scan.id }, data: { status: "COMPLETE", finishedAt: new Date(), pagesCrawled: pageCount } });
  process.stdout.write(`\nfixture site=${site.id} scan=${scan.id}\n`);
}

main().finally(() => prisma.$disconnect());
