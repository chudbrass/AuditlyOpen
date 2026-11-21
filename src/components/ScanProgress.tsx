"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPageAllowance, TERMINAL_SCAN_STATUSES } from "@/lib/scan/constants";
import type { ScanStatus, ScanType } from "@prisma/client";

interface ScanSummary {
  id: string;
  scanType?: ScanType;
  status: ScanStatus;
  pagesFound: number;
  pagesCrawled: number;
  pagesAudited?: number;
  startedAt?: string;
}

interface WorkerStatus {
  online: boolean;
  lastSeenAt: string | null;
}

const POLL_INTERVAL_MS = 2000;

const PHASES: { key: ScanStatus; label: string }[] = [
  { key: "QUEUED", label: "Queued" },
  { key: "CRAWLING", label: "Crawling" },
  { key: "AUDITING", label: "Auditing" },
  { key: "COMPLETE", label: "Complete" },
];

const TEXT_SEARCH_PHASES: typeof PHASES = [
  { key: "QUEUED", label: "Queued" },
  { key: "CRAWLING", label: "Searching" },
  { key: "COMPLETE", label: "Complete" },
];

const PAGE_AUDIT_PHASES: { key: ScanStatus; label: string }[] = [
  { key: "QUEUED", label: "Queued" },
  { key: "AUDITING", label: "Auditing" },
  { key: "COMPLETE", label: "Complete" },
];

const STATUS_DESCRIPTION: Record<ScanStatus, string> = {
  STARTING: "Preparing the persisted scan work set",
  QUEUED: "Waiting for the background worker to pick this scan up…",
  CRAWLING: "Discovering pages and running link, SEO, and QA checks",
  AUDITING: "Running Lighthouse on the selected page",
  FINALIZING: "Computing scores and derived findings",
  COMPLETE: "Scan complete",
  CANCELLED: "Scan cancelled",
  FAILED: "Scan failed",
};

function formatElapsed(startedAt: string | undefined, now: number): string | null {
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getPhaseIndex(status: ScanStatus, scanType: ScanType): number {
  if (scanType === "TEXT_SEARCH") {
    if (status === "STARTING" || status === "QUEUED") return 0;
    return status === "COMPLETE" ? 2 : 1;
  }
  if (scanType === "PAGE_AUDIT") {
    return status === "QUEUED" ? 0 : status === "AUDITING" ? 1 : 2;
  }
  return status === "QUEUED" ? 0 : status === "CRAWLING" ? 1 : status === "AUDITING" ? 2 : 3;
}

export default function ScanProgress({
  scan: initialScan,
  pageLimit,
}: {
  scan: ScanSummary;
  pageLimit?: { maxPages: number; perProvince: boolean };
}) {
  const [scan, setScan] = useState(initialScan);
  const [worker, setWorker] = useState<WorkerStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();
  const listRefreshCounter = useRef(0);

  const isActive = !TERMINAL_SCAN_STATUSES.includes(scan.status);

  useEffect(() => {
    setScan(initialScan);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when navigating to a different scan
  }, [initialScan.id]);

  // 1s tick for the elapsed-time readout
  useEffect(() => {
    if (!isActive) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (!cancelled && !document.hidden) timeout = setTimeout(poll, POLL_INTERVAL_MS);
    };
    const poll = async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/scans/${scan.id}`, { cache: "no-store" });
      if (res.ok) {
        const { scan: updated, worker: workerStatus } = await res.json();
        setScan(updated);
        if (workerStatus) setWorker(workerStatus);

        listRefreshCounter.current += 1;
        if (TERMINAL_SCAN_STATUSES.includes(updated.status) || listRefreshCounter.current % 3 === 0) {
          router.refresh();
        }
      }
      schedule();
    };
    const handleVisibilityChange = () => {
      if (timeout) clearTimeout(timeout);
      timeout = null;
      if (!document.hidden) void poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive, scan.id, router]);

  async function handleCancel() {
    setCancelling(true);
    const res = await fetch(`/api/scans/${scan.id}/cancel`, { method: "POST" });
    if (res.ok) {
      setScan((prev) => ({ ...prev, status: "CANCELLED" }));
      router.refresh();
    }
    setCancelling(false);
  }

  const elapsed = formatElapsed(scan.startedAt, now);
  const scanType = scan.scanType ?? "CRAWL";
  const phases = scanType === "TEXT_SEARCH" ? TEXT_SEARCH_PHASES : scanType === "PAGE_AUDIT" ? PAGE_AUDIT_PHASES : PHASES;
  const description = scanType === "TEXT_SEARCH" && scan.status === "CRAWLING"
    ? "Discovering pages and searching their text"
    : scanType === "TEXT_SEARCH" && scan.status === "FINALIZING"
      ? "Finalizing search results"
      : STATUS_DESCRIPTION[scan.status];
  const workerStalled = isActive && worker !== null && !worker.online;
  const crawlPct =
    scan.pagesFound > 0 ? Math.min(100, Math.round((scan.pagesCrawled / scan.pagesFound) * 100)) : 0;
  const auditPct =
    scan.pagesFound > 0 ? Math.min(100, Math.round(((scan.pagesAudited ?? 0) / scan.pagesFound) * 100)) : 0;
  const indeterminate =
    !workerStalled && (scan.status === "QUEUED" || (scan.status === "CRAWLING" && scan.pagesFound === 0));

  const phaseIndex = getPhaseIndex(scan.status, scanType);
  const failed = scan.status === "CANCELLED" || scan.status === "FAILED";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Phase stepper */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
          {phases.map((phase, i) => {
            const state = failed
              ? "muted"
              : i < phaseIndex
                ? "done"
                : i === phaseIndex
                  ? "active"
                  : "upcoming";
            return (
              <span key={phase.key} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300">→</span>}
                <span
                  className={
                    state === "done"
                      ? "text-green-600"
                      : state === "active"
                        ? "rounded-full bg-blue-600 px-2 py-0.5 text-white"
                        : "text-gray-400"
                  }
                >
                  {state === "done" ? `✓ ${phase.label}` : phase.label}
                </span>
              </span>
            );
          })}
          {failed && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
              {scan.status}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {elapsed && isActive && <span className="text-xs text-gray-400">running {elapsed}</span>}
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="ui-button bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              {cancelling ? "Cancelling…" : "Cancel scan"}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          {indeterminate ? (
            <div className="animate-indeterminate h-full w-1/3 rounded-full bg-blue-500/80" />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-700 ${workerStalled ? "bg-amber-400" : "bg-blue-500"}`}
              style={{ width: `${Math.max(3, scan.status === "AUDITING" ? auditPct : crawlPct)}%` }}
            />
          )}
        </div>
      )}

      {/* Status line */}
      <p className="mt-2 text-xs text-gray-500">
        {description}
        {pageLimit && isActive && (
          <span className="ml-2 font-medium text-gray-700">
            {formatPageAllowance(pageLimit.maxPages, pageLimit.perProvince)}
            {scan.status === "CRAWLING" && scan.pagesFound > 0 && ` · ${crawlPct}% complete`}
          </span>
        )}
        {!pageLimit && scan.status === "CRAWLING" && (
          <span className="ml-2 font-medium text-gray-700">
            {scan.pagesCrawled.toLocaleString()} / {scan.pagesFound > 0 ? scan.pagesFound.toLocaleString() : "?"} pages
            {crawlPct > 0 && ` (${crawlPct}%)`}
          </span>
        )}
        {scan.status === "AUDITING" && (
          <span className="ml-2 font-medium text-gray-700">
            {(scan.pagesAudited ?? 0).toLocaleString()} / {scan.pagesFound.toLocaleString()} pages audited
          </span>
        )}
      </p>

      {/* Worker-offline warning — the honest version of "why does this look hung?" */}
      {workerStalled && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">The background worker isn&apos;t running.</span> This scan is
          saved and will {scan.status === "QUEUED" ? "start" : "resume"} automatically as soon as the
          worker comes up — start it with <code className="rounded bg-amber-100 px-1 font-mono">npm run worker</code>{" "}
          (or run everything with <code className="rounded bg-amber-100 px-1 font-mono">npm run dev:all</code>).
        </div>
      )}
    </div>
  );
}
