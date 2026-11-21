"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScanType } from "@prisma/client";
import { scanTypeShortLabel } from "@/lib/scan/constants";
import { provinceScopeLabel } from "@/lib/crawler/provinces";

const PREVIEW_COUNT = 5;
const SCAN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Toronto",
});

type ScanItem = {
  id: string;
  scanType?: ScanType;
  startedAt: string;
  status: string;
  pagesFound: number;
  pagesCrawled: number;
  hasProvinceCoverage: boolean;
  scanProvinces: string[];
  scoreOverall: number | null;
};

export default function ScanHistoryList({ siteId, scans }: { siteId: string; scans: ScanItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? scans : scans.slice(0, PREVIEW_COUNT);

  return (
    <>
      <ul className="mt-3 divide-y divide-gray-100">
        {visible.map((scan) => (
          <li key={scan.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <Link href={`/sites/${siteId}/scans/${scan.id}`} className="min-w-0 flex-1 hover:underline">
              {SCAN_DATE_FORMATTER.format(new Date(scan.startedAt))}
              <span className="ml-2 text-gray-400">
                {scan.scanType === "PAGE_AUDIT"
                  ? `${scan.pagesCrawled.toLocaleString()} page${scan.pagesCrawled === 1 ? "" : "s"} tested`
                  : scan.scanProvinces.length > 0 ? provinceScopeLabel(scan.scanProvinces) : scan.hasProvinceCoverage
                    ? "Province coverage"
                    : `${scan.pagesCrawled.toLocaleString()}/${scan.pagesFound.toLocaleString()} pages processed`}
                {scan.scoreOverall !== null && ` · score ${scan.scoreOverall}`}
              </span>
            </Link>
            {scan.scanType && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                {scanTypeShortLabel(scan.scanType)}
              </span>
            )}
            <span
              className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                scan.status === "COMPLETE"
                  ? "bg-green-100 text-green-700"
                  : scan.status === "FAILED" || scan.status === "CANCELLED"
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
              }`}
            >
              {scan.status}
            </span>
          </li>
        ))}
      </ul>
      {scans.length > PREVIEW_COUNT && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="ui-button mt-3 w-full border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          View {scans.length - PREVIEW_COUNT} more
        </button>
      )}
    </>
  );
}
