import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function findingFingerprint(input: {
  code: string; pageUrl?: string | null; evidence?: unknown;
}): string {
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence as Record<string, unknown> : {};
  const identityEvidence = {
    targetUrl: evidence.targetUrl,
    selector: evidence.selector,
    sampleSelectors: evidence.sampleSelectors,
    ...(input.code === "seo.duplicate-title" ? { title: evidence.title } : {}),
    ...(input.code === "seo.duplicate-meta-description" ? { metaDescription: evidence.metaDescription } : {}),
  };
  const identity = `${input.code}\n${input.pageUrl ?? "site-wide"}\n${stableJson(identityEvidence)}`;
  return createHash("sha256").update(identity).digest("hex");
}

export async function ensureScanFindingFingerprints(scanId: string): Promise<void> {
  const batchSize = 500;
  let cursor: string | undefined;
  for (;;) {
    const findings = await prisma.finding.findMany({
      where: { scanId, fingerprint: null },
      select: { id: true, code: true, evidence: true, page: { select: { url: true } } },
      orderBy: { id: "asc" }, take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!findings.length) return;
    await prisma.$transaction(findings.map((finding) => prisma.finding.update({
      where: { id: finding.id },
      data: { fingerprint: findingFingerprint({ ...finding, pageUrl: finding.page?.url }) },
    })));
    cursor = findings.at(-1)?.id;
    if (findings.length < batchSize) return;
  }
}
