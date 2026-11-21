import { prisma } from "@/lib/db";
import { findingFingerprint } from "./fingerprint";

/**
 * Keep the original observations and IDs for locale reports, existing rechecks, and history.
 * Published issue queries select one representative per issue through duplicateOfId.
 */
export async function consolidateProvincialFindings(scanId: string): Promise<void> {
  const observations = await prisma.finding.findMany({
    where: { scanId, province: { not: null } },
    select: {
      id: true, code: true, province: true, evidence: true, fingerprint: true,
      duplicateOfId: true, affectedProvinces: true, page: { select: { url: true } },
    },
    orderBy: { id: "asc" },
  });
  const groups = new Map<string, typeof observations>();
  for (const row of observations) {
    const fingerprint = findingFingerprint({ ...row, pageUrl: row.page?.url });
    const group = groups.get(fingerprint);
    if (group) group.push(row);
    else groups.set(fingerprint, [row]);
  }

  await prisma.$transaction(async (tx) => {
    for (const [fingerprint, [representative, ...duplicates]] of groups) {
      const affectedProvinces = [...new Set([representative, ...duplicates].flatMap(
        ({ province }) => province ? [province] : []
      ))].sort();
      if (representative.fingerprint !== fingerprint || representative.duplicateOfId !== null ||
          representative.affectedProvinces.join(",") !== affectedProvinces.join(",")) {
        await tx.finding.update({
          where: { id: representative.id },
          data: { fingerprint, affectedProvinces, duplicateOfId: null },
        });
      }
      const changed = duplicates.filter((row) =>
        row.fingerprint !== fingerprint || row.duplicateOfId !== representative.id || row.affectedProvinces.length > 0
      );
      if (changed.length) {
        await tx.finding.updateMany({
          where: { id: { in: changed.map(({ id }) => id) } },
          data: { fingerprint, duplicateOfId: representative.id, affectedProvinces: [] },
        });
      }
    }
  }, { timeout: 120_000 });
}
