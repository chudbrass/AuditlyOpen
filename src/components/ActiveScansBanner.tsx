"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ScanType } from "@prisma/client";
import { formatPageAllowance, scanTypeShortLabel } from "@/lib/scan/constants";
import { useRouter } from "next/navigation";

interface ActiveScan {
  id: string;
  siteId: string;
  siteName: string;
  scanType: ScanType;
  status: "QUEUED" | "STARTING" | "CRAWLING" | "AUDITING" | "FINALIZING";
  pagesFound: number;
  pagesCrawled: number;
  pagesAudited: number;
  maxPages: number | null;
  pagesPerProvince: number | null;
  startedAt: string;
  queuePosition: number | null;
}

interface WorkerStatus {
  online: boolean;
  lastSeenAt: string | null;
}

const ACTIVE_POLL_INTERVAL_MS = 2000;
const IDLE_POLL_INTERVAL_MS = 12000;
const EMPTY_RESPONSES_BEFORE_BACKOFF = 3;

const STATUS_LABEL: Record<ActiveScan["status"], string> = {
  QUEUED: "Queued",
  STARTING: "Starting",
  CRAWLING: "Crawling",
  AUDITING: "Auditing",
  FINALIZING: "Finalizing",
};

function typeLabel(scanType: ActiveScan["scanType"]): string {
  return scanTypeShortLabel(scanType);
}

function formatElapsed(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function ScanRow({
  scan,
  workerOnline,
  onChange,
}: {
  scan: ActiveScan;
  workerOnline: boolean;
  onChange: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const pct =
    scan.status === "AUDITING"
      ? scan.pagesFound > 0 ? Math.round((scan.pagesAudited / scan.pagesFound) * 100) : 0
      : scan.pagesFound > 0
        ? Math.round((scan.pagesCrawled / scan.pagesFound) * 100)
        : 0;
  const indeterminate =
    workerOnline && scan.status !== "QUEUED" && (scan.status === "STARTING" || scan.pagesFound === 0);
  const progressLabel = scan.maxPages != null
    ? formatPageAllowance(scan.maxPages, scan.pagesPerProvince != null)
    : scan.status === "AUDITING"
      ? `${scan.pagesAudited}/${scan.pagesFound} audited`
      : `${scan.pagesCrawled.toLocaleString()}/${scan.pagesFound > 0 ? scan.pagesFound.toLocaleString() : "?"} pages`;

  async function handleCancel() {
    setCancelling(true);
    await fetch(`/api/scans/${scan.id}/cancel`, { method: "POST" });
    onChange();
    setCancelling(false);
  }

  return (
    <div className="flex items-start gap-3 py-2 first:pt-0 last:pb-0 sm:items-center">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {workerOnline ? (
          scan.status === "QUEUED" ? (
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          ) : (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
            </>
          )
        ) : (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <Link href={`/sites/${scan.siteId}/scans/${scan.id}`} className="font-medium text-gray-900 hover:underline">
            {scan.siteName}
          </Link>
          <span className={`text-xs ${workerOnline ? "text-blue-700" : "text-amber-700"}`}>
            {workerOnline
              ? scan.status === "QUEUED"
                ? `${typeLabel(scan.scanType)} queued #${scan.queuePosition ?? "?"}`
                : `${typeLabel(scan.scanType)} ${STATUS_LABEL[scan.status].toLowerCase()}`
              : "Waiting for worker"}
          </span>
          <span className="text-xs text-gray-400">
            {progressLabel}
            {" · "}
            {formatElapsed(scan.startedAt)}
          </span>
        </div>
        <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${workerOnline ? "bg-blue-100" : "bg-amber-100"}`}>
          {scan.status === "QUEUED" ? null : indeterminate ? (
            <div className="animate-indeterminate h-full w-1/3 rounded-full bg-blue-500/80" />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-500 ${workerOnline ? "bg-blue-500" : "bg-amber-400"}`}
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          )}
        </div>
      </div>

      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="ui-button shrink-0 px-2 py-1 text-xs font-medium text-gray-500 hover:bg-white hover:text-red-600"
      >
        {cancelling ? "Cancelling…" : "Cancel"}
      </button>
    </div>
  );
}

export default function ActiveScansBanner() {
  const [scans, setScans] = useState<ActiveScan[] | null>(null);
  const [worker, setWorker] = useState<WorkerStatus | null>(null);
  const router = useRouter();
  const emptyResponses = useRef(0);

  const refresh = useCallback(async (): Promise<number | null> => {
    const res = await fetch("/api/scans/active", { cache: "no-store" });
    if (!res.ok) return null;
    const { scans: next, worker: workerStatus } = await res.json();
    if (workerStatus) setWorker(workerStatus);
    emptyResponses.current = next.length === 0 ? emptyResponses.current + 1 : 0;
    setScans((prev) => {
      if (prev && prev.length > 0 && next.length === 0) router.refresh();
      return next;
    });
    return next.length;
  }, [router]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = (delay: number) => {
      if (!cancelled && !document.hidden) timeout = setTimeout(poll, delay);
    };
    const poll = async () => {
      if (document.hidden) return;
      const activeCount = await refresh();
      if (cancelled || document.hidden) return;
      const idle = activeCount === 0 && emptyResponses.current >= EMPTY_RESPONSES_BEFORE_BACKOFF;
      schedule(idle ? IDLE_POLL_INTERVAL_MS : ACTIVE_POLL_INTERVAL_MS);
    };
    const handleVisibilityChange = () => {
      if (timeout) clearTimeout(timeout);
      timeout = null;
      if (!document.hidden) void poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  if (!scans || scans.length === 0) return null;

  const workerOnline = worker?.online ?? true; // assume online until the API says otherwise

  return (
    <div
      className={`border-b px-4 py-3 sm:px-6 lg:px-8 ${
        workerOnline ? "border-blue-100 bg-blue-50/70" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="mx-auto max-w-6xl">
        {!workerOnline && (
          <div className="mb-2 text-xs text-amber-800">
            <span className="font-semibold">Background worker offline.</span> Scans are saved and
            will resume automatically once it starts —{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">npm run worker</code> or{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">npm run dev:all</code>.
          </div>
        )}
        <div className={`divide-y ${workerOnline ? "divide-blue-100" : "divide-amber-100"}`}>
          {scans.map((scan) => (
            <ScanRow key={scan.id} scan={scan} workerOnline={workerOnline} onChange={refresh} />
          ))}
        </div>
      </div>
    </div>
  );
}
