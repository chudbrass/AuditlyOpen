import Link from "next/link";
import { prisma } from "@/lib/db";
import ScoreRing from "@/components/ui/ScoreRing";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/ui/colors";
import { issueTotal } from "@/lib/dashboard";
import { getCurrentSiteSnapshots } from "@/lib/currentSiteSnapshot";

export const dynamic = "force-dynamic";

const CATEGORY_KEYS = ["LINKS", "SEO", "A11Y", "QA", "SECURITY"] as const;

export default async function ReportsPage() {
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  const snapshots = new Map((await getCurrentSiteSnapshots(sites.map((site) => site.id))).map((snapshot) => [snapshot.siteId, snapshot]));

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="mt-1 text-sm text-gray-500">
        Executive summaries of the latest completed scan for each site.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => {
          const snapshot = snapshots.get(site.id)!;
          const scan = snapshot.crawl;

          if (!scan) {
            return (
              <div
                key={site.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-gray-900">{site.name}</h2>
                <p className="mt-1 truncate text-sm text-gray-500">{site.rootUrl}</p>
                <p className="mt-6 text-sm text-gray-500">
                  Run a scan to generate a report.
                </p>
              </div>
            );
          }

          const counts = snapshot.issueCounts;
          const total = issueTotal(counts);

          return (
            <div
              key={site.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-gray-900">
                    {site.name}
                  </h2>
                  <p className="mt-1 truncate text-sm text-gray-500">{site.rootUrl}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Latest scan:{" "}
                    {scan.finishedAt
                      ? new Date(scan.finishedAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
                <ScoreRing score={snapshot.scoreOverall} size={64} strokeWidth={6} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORY_KEYS.map((cat) => {
                  const score = snapshot.scores[cat];
                  return (
                    <div
                      key={cat}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-center"
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{ color: CATEGORY_COLORS[cat] }}
                      >
                        {score ?? "—"}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                        {CATEGORY_LABELS[cat]}
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{total}</span> open issue
                {total === 1 ? "" : "s"}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/reports/${site.id}`}
                  className="ui-button bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                >
                  View report
                </Link>
                <a
                  href={`/api/reports/${site.id}/csv`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Download CSV
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {sites.length === 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
          No sites yet. Add a site to start generating reports.
        </div>
      )}
    </div>
  );
}
