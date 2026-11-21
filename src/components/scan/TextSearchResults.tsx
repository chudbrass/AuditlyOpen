import Link from "next/link";
import { z } from "zod";
import { Prisma, type Scan, type TextSearchMatch } from "@prisma/client";
import ScanProgress from "@/components/ScanProgress";
import DeleteScanButton from "@/components/scan/DeleteScanButton";
import { CANADIAN_PROVINCES, crawlBrand } from "@/lib/crawler/localization";
import { provinceScopeLabel } from "@/lib/crawler/provinces";
import { prisma } from "@/lib/db";
import { ACTIVE_SCAN_STATUSES, pageLimitLabel, TERMINAL_SCAN_STATUSES } from "@/lib/scan/constants";

const PAGE_SIZE = 50;
const excerptsSchema = z.array(z.object({ before: z.string(), match: z.string(), after: z.string() }));
const cursorSchema = z.string().regex(/^[a-f0-9]{64}$/);

function MatchDetails({ match }: { match: TextSearchMatch }) {
  const excerpts = excerptsSchema.safeParse(match.excerpts).data ?? [];
  return (
    <div className="mt-2">
      <p className="text-sm text-gray-600">
        {match.province && <strong className="text-gray-800">{match.province} · </strong>}
        {match.count.toLocaleString()} {match.count === 1 ? "match" : "matches"}
      </p>
      <ul className="mt-1 space-y-1 text-sm text-gray-700">
        {excerpts.map(({ before, match, after }, index) => (
          <li key={index} className="break-words border-l-2 border-gray-200 pl-3">
            {before}<mark className="rounded bg-amber-100 text-inherit">{match}</mark>{after}
          </li>
        ))}
      </ul>
      {match.count > excerpts.length && <p className="mt-2 text-xs text-gray-500">Showing the first {excerpts.length} matches.</p>}
    </div>
  );
}

export default async function TextSearchResults({
  scan, cursor,
}: {
  scan: Scan & { site: { name: string; rootUrl: string; maxPages: number } };
  cursor?: string;
}) {
  const isActive = ACTIVE_SCAN_STATUSES.some((status) => status === scan.status);
  const afterHash = cursorSchema.safeParse(cursor).data;
  const [pageKeys, totals, coverage, legacyMatch] = await Promise.all([
    prisma.textSearchMatch.groupBy({
      by: ["urlHash"],
      where: { scanId: scan.id, ...(afterHash ? { urlHash: { gt: afterHash } } : {}) },
      orderBy: { urlHash: "asc" },
      take: PAGE_SIZE + 1,
    }),
    prisma.textSearchMatch.groupBy({
      by: ["province"],
      where: { scanId: scan.id },
      _count: { _all: true },
      _sum: { count: true },
    }),
    prisma.page.groupBy({
      by: ["requestedProvince"],
      where: { scanId: scan.id },
      _count: { textMatchCount: true },
    }),
    prisma.page.findFirst({
      where: { scanId: scan.id, textMatchCount: { gt: 0 }, textMatchExcerpts: { not: Prisma.DbNull } },
      select: { id: true },
    }),
  ]);
  const visibleKeys = pageKeys.slice(0, PAGE_SIZE).map(({ urlHash }) => urlHash);
  const pages = visibleKeys.length > 0 ? await prisma.textSearchMatch.findMany({
    where: { scanId: scan.id, urlHash: { in: visibleKeys } },
    orderBy: [{ urlHash: "asc" }, { province: "asc" }],
  }) : [];
  const matchesByPage = new Map<string, TextSearchMatch[]>();
  for (const match of pages) {
    const variants = matchesByPage.get(match.urlHash);
    if (variants) variants.push(match);
    else matchesByPage.set(match.urlHash, [match]);
  }
  const regional = scan.scanProvinces.length > 0 || coverage.some(({ requestedProvince }) => requestedProvince !== null);
  const provinces = scan.scanProvinces.length > 0 ? scan.scanProvinces : CANADIAN_PROVINCES;
  const supportsRegions = regional || crawlBrand(scan.site.rootUrl) !== null;
  const searchedCount = coverage.reduce((count, row) => count + row._count.textMatchCount, 0);
  const matchingVariants = totals.reduce((count, row) => count + row._count._all, 0);
  const matchCount = totals.reduce((count, row) => count + (row._sum.count ?? 0), 0);
  const skippedCount = Math.max(0, scan.pagesCrawled - searchedCount);
  const hasMore = pageKeys.length > PAGE_SIZE;
  const lastPageHash = visibleKeys.at(-1);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/sites/${scan.siteId}`} className="text-sm text-gray-500 hover:underline">← {scan.site.name}</Link>
      <h1 className="mt-2 text-2xl font-bold">Text Search</h1>
      <p className="mt-1 break-words text-sm text-gray-600">Results for “{scan.textSearchQuery}”</p>
      {regional && <p className="mt-1 text-sm text-gray-600">Scan provinces · {provinceScopeLabel(provinces)}</p>}
      <p className="mt-1 text-xs text-gray-500">
        Current {pageLimitLabel(supportsRegions).toLowerCase()} · {scan.site.maxPages.toLocaleString()}
      </p>
      <div className="mt-4">
        <ScanProgress
          pageLimit={{ maxPages: scan.site.maxPages, perProvince: supportsRegions }}
          scan={{
            id: scan.id,
            scanType: scan.scanType,
            status: scan.status,
            pagesFound: scan.pagesFound,
            pagesCrawled: scan.pagesCrawled,
            startedAt: scan.startedAt.toISOString(),
          }}
        />
      </div>

      <section aria-label="Matching pages" className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Matching pages</h2>
        <p className="mt-1 text-sm text-gray-600">
          {matchCount.toLocaleString()} matches across {matchingVariants.toLocaleString()} {regional ? "page–province combinations" : "matching pages"}
          {" · "}{searchedCount.toLocaleString()} HTML responses searched
          {skippedCount > 0 && ` · ${skippedCount.toLocaleString()} skipped`}
        </p>
        {regional && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left font-semibold text-gray-800">Results by province</caption>
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  {["Province", "Pages searched", "Matching pages", "Matches"].map((label) => (
                    <th key={label} scope="col" className="px-2 py-2 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {provinces.map((province) => {
                  const searched = coverage.find((row) => row.requestedProvince === province)?._count.textMatchCount ?? 0;
                  const matches = totals.find((row) => row.province === province);
                  return (
                    <tr key={province} className="border-b border-gray-100">
                      <th scope="row" className="px-2 py-1 font-medium">{province}</th>
                      <td className="px-2 py-1 tabular-nums">{searched.toLocaleString()}</td>
                      <td className="px-2 py-1 tabular-nums">{(matches?._count._all ?? 0).toLocaleString()}</td>
                      <td className="px-2 py-1 tabular-nums">{(matches?._sum.count ?? 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!regional && supportsRegions && !isActive && (
          <p className="mt-3 text-sm text-gray-600">This run has no province data. Start a new Text Search for provincial results.</p>
        )}
        {legacyMatch && (
          <p className="mt-3 text-sm text-amber-800">
            Some matches were recorded before redirect destinations were saved. Run Text Search again for a complete list of final page URLs.
          </p>
        )}
        {pages.length === 0 && !legacyMatch && (
          <p className="mt-4 text-sm text-gray-500">
            {afterHash ? "No more matching pages." : isActive ? "No matches yet." : "No matching text was found in the pages searched."}
          </p>
        )}
        <ul className="mt-3 divide-y divide-gray-100">
          {[...matchesByPage].map(([urlHash, variants]) => {
            const [page] = variants;
            const provinces = variants.flatMap(({ province }) => province ? [province] : []);
            return (
              <li key={urlHash} className="py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a href={page.url} target="_blank" rel="noreferrer" className="break-all font-medium text-blue-700 hover:underline">
                    {page.title || page.url}
                  </a>
                  {provinces.length > 0 && (
                    <span className="text-xs text-gray-600">Provinces · {provinces.join(", ")}</span>
                  )}
                  {provinces.length === 0 && supportsRegions && (
                    <span className="text-xs text-gray-600">Province unknown</span>
                  )}
                </div>
                {page.title && <p className="mt-1 break-all text-xs text-gray-500">{page.url}</p>}
                {variants.map((match) => <MatchDetails key={match.province} match={match} />)}
              </li>
            );
          })}
        </ul>
        {(afterHash || hasMore) && (
          <nav aria-label="Search result pages" className="mt-3 flex gap-4 text-sm text-blue-700">
            {afterHash && <Link href={`/sites/${scan.siteId}/scans/${scan.id}`} className="hover:underline">First page</Link>}
            {hasMore && lastPageHash && <Link href={`?pageCursor=${lastPageHash}`} className="hover:underline">Next page</Link>}
          </nav>
        )}
      </section>
      {TERMINAL_SCAN_STATUSES.includes(scan.status) && <DeleteScanButton scanId={scan.id} siteId={scan.siteId} />}
    </div>
  );
}
