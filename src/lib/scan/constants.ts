import type { ScanStatus, ScanType } from "@prisma/client";

export const ACTIVE_SCAN_STATUSES = ["QUEUED", "STARTING", "CRAWLING", "AUDITING", "FINALIZING"] as const satisfies ScanStatus[];
export const TERMINAL_SCAN_STATUSES: readonly ScanStatus[] = ["COMPLETE", "CANCELLED", "FAILED"];

export function usesSitePageLimit(scanType: ScanType): boolean {
  return scanType === "CRAWL" || scanType === "TEXT_SEARCH";
}

export function pageLimitLabel(perProvince: boolean): string {
  return perProvince ? "Page limit per province" : "Page limit";
}

export function formatPageAllowance(maxPages: number, perProvince: boolean): string {
  return `Up to ${maxPages.toLocaleString()} ${maxPages === 1 ? "page" : "pages"}${perProvince ? " per province" : ""}`;
}

export function scanTypeLabel(scanType: ScanType): string {
  if (scanType === "PAGE_AUDIT") return "Performance scan";
  if (scanType === "TEXT_SEARCH") return "Text search";
  return "Crawl scan";
}

export function scanTypeShortLabel(scanType: ScanType): string {
  if (scanType === "PAGE_AUDIT") return "Performance";
  if (scanType === "TEXT_SEARCH") return "Text Search";
  return "Crawl";
}
