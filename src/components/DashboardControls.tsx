"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface DashboardControlSite {
  id: string;
  name: string;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-slate-400">
      <path
        d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4 6h16l-6 7v4l-4 2v-6L4 6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function DashboardControls({
  dateRangeLabel,
  sites,
  selectedSiteId,
}: {
  dateRangeLabel: string | null;
  sites: DashboardControlSite[];
  selectedSiteId: string | null;
}) {
  const router = useRouter();
  const scopedIssuesHref = selectedSiteId ? `/issues?site=${encodeURIComponent(selectedSiteId)}` : "/issues";
  const reportHref = selectedSiteId ? `/reports/${encodeURIComponent(selectedSiteId)}` : "/reports";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dateRangeLabel && (
        <Link
          href={reportHref}
          className="ui-button h-10 gap-2 border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          title="Open reports for this dashboard scope"
        >
          <span>{dateRangeLabel}</span>
          <CalendarIcon />
        </Link>
      )}
      <label className="sr-only" htmlFor="portfolio-filter">
        Portfolio
      </label>
      <select
        id="portfolio-filter"
        className="h-10 max-w-[190px] rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        value={selectedSiteId ?? "all"}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value === "all" ? "/" : `/?site=${encodeURIComponent(value)}`);
        }}
      >
        <option value="all">All Websites</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
      <Link
        href={scopedIssuesHref}
        className="ui-button h-10 gap-2 border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
      >
        <FilterIcon />
        Filters
      </Link>
    </div>
  );
}
