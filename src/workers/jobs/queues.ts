import { z } from "zod";

export const QUEUE_SCAN_START = "scan.start";
export const QUEUE_CRAWL_PAGE = "crawl.page";
export const QUEUE_AUDIT_PAGE = "audit.page";
export const QUEUE_SCAN_FINALIZE = "scan.finalize";
export const QUEUE_ITEM_CHECK = "item.check";
export const QUEUE_DEAD_LETTER = "auditly.dead-letter";

export const ALL_QUEUES = [
  QUEUE_SCAN_START,
  QUEUE_CRAWL_PAGE,
  QUEUE_AUDIT_PAGE,
  QUEUE_SCAN_FINALIZE,
  QUEUE_ITEM_CHECK,
  QUEUE_DEAD_LETTER,
] as const;

export interface ScanStartPayload {
  scanId: string;
}

export interface CrawlPagePayload {
  scanId: string;
  pageId: string;
}

export interface AuditPagePayload {
  scanId: string;
  pageId: string;
}

export interface ScanFinalizePayload {
  scanId: string;
}

export interface ItemCheckPayload {
  itemCheckId: string;
}

const id = z.string().min(1).max(128);
export const scanStartPayloadSchema = z.object({ scanId: id }).strict();
export const crawlPagePayloadSchema = z.object({ scanId: id, pageId: id }).strict();
export const auditPagePayloadSchema = crawlPagePayloadSchema;
export const scanFinalizePayloadSchema = z.object({ scanId: id }).strict();
export const itemCheckPayloadSchema = z.object({ itemCheckId: id }).strict();
