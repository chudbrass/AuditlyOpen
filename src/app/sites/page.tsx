import Link from "next/link";
import { getSiteSummaries } from "@/lib/dashboard";
import { siteProvinces } from "@/lib/crawler/brand";
import { pageLimitLabel, scanTypeLabel } from "@/lib/scan/constants";
import ScoreRing from "@/components/ui/ScoreRing";
import Sparkline from "@/components/charts/Sparkline";
import ScanLaunchButton from "@/components/ScanLaunchButton";
import SiteOrderControls from "@/components/SiteOrderControls";
import { scoreColor, scoreLabel } from "@/lib/ui/colors";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const sites = await getSiteSummaries();
  const siteIds = sites.map((site) => site.id);

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="mt-1 text-sm text-gray-500">Manage and scan the sites in your portfolio.</p>
        </div>
        <Link
          href="/sites/new"
          className="ui-button bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add site
        </Link>
      </div>

      {sites.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white py-16">
          <div className="text-lg font-semibold">No sites yet</div>
          <p className="mt-1 text-sm text-gray-500">Add your first site to start scanning.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => {
            const score = site.latestScan?.scoreOverall ?? null;
            return (
              <div key={site.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <Link href={`/sites/${site.id}`} className="block truncate font-semibold hover:underline">
                      {site.name}
                    </Link>
                    <div className="truncate text-xs text-gray-400">{site.rootUrl}</div>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <SiteOrderControls siteIds={siteIds} siteId={site.id} siteName={site.name} />
                    <ScoreRing score={score} size={52} strokeWidth={5} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 py-2">
                    <div className="text-sm font-bold">{site.maxPages.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-400">{pageLimitLabel(site.pageLimitPerProvince)}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-2">
                    <div className="text-sm font-bold">{site.latestScan ? site.openIssues : "—"}</div>
                    <div className="text-[10px] text-gray-400">Open issues</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-2">
                    <div className="text-sm font-bold">{site.issueCounts.critical}</div>
                    <div className="text-[10px] text-gray-400">Critical</div>
                  </div>
                </div>

                <div className="mt-3">
                  <Sparkline values={site.scoreHistory} color={score !== null ? scoreColor(score) : "#9ca3af"} height={32} />
                </div>

                <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-gray-500">
                    {site.activeScan ? (
                      <span className="text-blue-600">
                        {scanTypeLabel(site.activeScan.scanType)}{" "}
                        ({site.activeScan.status.toLowerCase()})
                      </span>
                    ) : site.latestScan ? (
                      <>
                        {score !== null && (
                          <span className="mr-2 font-medium" style={{ color: scoreColor(score) }}>
                            {scoreLabel(score)}
                          </span>
                        )}
                        Last scan {new Date(site.latestScan.startedAt).toLocaleDateString()}
                      </>
                    ) : (
                      "Never scanned"
                    )}
                  </div>
                  {!site.activeScan && <ScanLaunchButton siteId={site.id} availableProvinces={siteProvinces(site.rootUrl)} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
