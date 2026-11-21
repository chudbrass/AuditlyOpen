import { Category, Prisma, Severity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureScanFindingFingerprints } from "@/lib/findings/fingerprint";
import { CANADIAN_PROVINCES } from "@/lib/crawler/provinces";

const COMPARISON_SAMPLE_LIMIT = 50;
const FINDING_BATCH_SIZE = 500;

export interface ComparedFinding {
  code: string;
  category: Category;
  severity: Severity;
  message: string;
  pageUrl: string | null;
  affectedProvinces: string[];
}

export interface ScanComparison {
  previousScanId: string | null;
  newFindingCount: number;
  resolvedFindingCount: number;
  persistingFindingCount: number;
  /** Bounded representative rows for the detail view; use the count fields for totals. */
  newFindings: ComparedFinding[];
  resolvedFindings: ComparedFinding[];
}

type FindingRow = ComparedFinding & { id: string; evidence: Prisma.JsonValue | null };

function emptyComparison(previousScanId: string | null): ScanComparison {
  return {
    previousScanId,
    newFindingCount: 0,
    resolvedFindingCount: 0,
    persistingFindingCount: 0,
    newFindings: [],
    resolvedFindings: [],
  };
}

function toComparedFinding(row: FindingRow): ComparedFinding {
  return {
    code: row.code,
    category: row.category,
    severity: row.severity,
    message: row.message,
    pageUrl: row.pageUrl,
    affectedProvinces: row.affectedProvinces,
  };
}

async function forEachFindingBatch(scanId: string, callback: (rows: FindingRow[]) => void | Promise<void>): Promise<void> {
  let cursor: string | undefined;
  do {
    const rows = await prisma.finding.findMany({
      where: { scanId, duplicateOfId: null },
      select: {
        id: true,
        code: true,
        category: true,
        severity: true,
        message: true,
        evidence: true,
        affectedProvinces: true,
        page: { select: { url: true } },
      },
      orderBy: { id: "asc" },
      take: FINDING_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const mapped = rows.map((row) => ({ ...row, pageUrl: row.page?.url ?? null, page: undefined }));
    await callback(mapped);
    cursor = rows.at(-1)?.id;
    if (rows.length < FINDING_BATCH_SIZE) return;
  } while (cursor);
}

function addSample(samples: ComparedFinding[], finding: ComparedFinding): void {
  if (samples.length < COMPARISON_SAMPLE_LIMIT) samples.push(finding);
}

async function fingerprintComparison(scanId: string, previousScanId: string): Promise<ScanComparison> {
  await Promise.all([ensureScanFindingFingerprints(scanId), ensureScanFindingFingerprints(previousScanId)]);
  const [currentGroups, previousGroups] = await Promise.all([
    prisma.finding.groupBy({ by: ["fingerprint"], where: { scanId, duplicateOfId: null, fingerprint: { not: null } }, _count: { _all: true } }),
    prisma.finding.groupBy({ by: ["fingerprint"], where: { scanId: previousScanId, duplicateOfId: null, fingerprint: { not: null } }, _count: { _all: true } }),
  ]);
  const current = new Map(currentGroups.flatMap((group) => group.fingerprint ? [[group.fingerprint, group._count._all] as const] : []));
  const previous = new Map(previousGroups.flatMap((group) => group.fingerprint ? [[group.fingerprint, group._count._all] as const] : []));
  const newFingerprints: string[] = [];
  const resolvedFingerprints: string[] = [];
  let newFindingCount = 0;
  let resolvedFindingCount = 0;
  let persistingFindingCount = 0;
  for (const [fingerprint, count] of current) {
    const prior = previous.get(fingerprint) ?? 0;
    newFindingCount += Math.max(0, count - prior);
    persistingFindingCount += Math.min(count, prior);
    if (count > prior && newFingerprints.length < COMPARISON_SAMPLE_LIMIT) newFingerprints.push(fingerprint);
  }
  for (const [fingerprint, count] of previous) {
    const next = current.get(fingerprint) ?? 0;
    resolvedFindingCount += Math.max(0, count - next);
    if (count > next && resolvedFingerprints.length < COMPARISON_SAMPLE_LIMIT) resolvedFingerprints.push(fingerprint);
  }
  const select = { code: true, category: true, severity: true, message: true, affectedProvinces: true, page: { select: { url: true } } } as const;
  const [newRows, resolvedRows] = await Promise.all([
    newFingerprints.length ? prisma.finding.findMany({ where: { scanId, duplicateOfId: null, fingerprint: { in: newFingerprints } }, distinct: ["fingerprint"], select, take: COMPARISON_SAMPLE_LIMIT }) : [],
    resolvedFingerprints.length ? prisma.finding.findMany({ where: { scanId: previousScanId, duplicateOfId: null, fingerprint: { in: resolvedFingerprints } }, distinct: ["fingerprint"], select, take: COMPARISON_SAMPLE_LIMIT }) : [],
  ]);
  return {
    previousScanId, newFindingCount, resolvedFindingCount, persistingFindingCount,
    newFindings: newRows.map(({ page, ...row }) => ({ ...row, pageUrl: page?.url ?? null })),
    resolvedFindings: resolvedRows.map(({ page, ...row }) => ({ ...row, pageUrl: page?.url ?? null })),
  };
}

export async function compareToPreviousScan(scanId: string): Promise<ScanComparison> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { siteId: true, scanType: true, startedAt: true, scanProvinces: true },
  });
  if (!scan) return emptyComparison(null);

  const previous = await prisma.scan.findFirst({
    where: {
      siteId: scan.siteId, scanType: scan.scanType, status: "COMPLETE", startedAt: { lt: scan.startedAt },
      ...comparableProvinceScope(scan.scanProvinces),
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!previous) {
    const comparison = emptyComparison(null);
    comparison.newFindingCount = await prisma.finding.count({ where: { scanId, duplicateOfId: null } });
    await forEachFindingBatch(scanId, (rows) => {
      for (const row of rows) addSample(comparison.newFindings, toComparedFinding(row));
    });
    return comparison;
  }

  return fingerprintComparison(scanId, previous.id);
}

export function comparableProvinceScope(provinces: string[]): Prisma.ScanWhereInput {
  if (provinces.length > 0 && provinces.length < CANADIAN_PROVINCES.length) {
    return { scanProvinces: { equals: provinces } };
  }
  // Scans recorded before province selection used the site's default coverage.
  return { OR: [{ scanProvinces: { isEmpty: true } }, { scanProvinces: { equals: [...CANADIAN_PROVINCES] } }] };
}
