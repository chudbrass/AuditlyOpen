export type IssueCounts = {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
};

export const EMPTY_COUNTS: IssueCounts = {
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
};

export function parseIssueCounts(raw: unknown): IssueCounts {
  if (!raw || typeof raw !== "object") return { ...EMPTY_COUNTS };
  const obj = raw as Record<string, unknown>;
  return {
    critical: Number(obj.critical ?? 0),
    serious: Number(obj.serious ?? 0),
    moderate: Number(obj.moderate ?? 0),
    minor: Number(obj.minor ?? 0),
  };
}

export function issueTotal(counts: IssueCounts): number {
  return counts.critical + counts.serious + counts.moderate + counts.minor;
}
