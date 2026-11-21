import { prisma } from "../src/lib/db";
import { computeScanScores } from "../src/lib/scoring";
import { ensureScanFindingFingerprints } from "../src/lib/findings/fingerprint";
import { consolidateProvincialFindings } from "../src/lib/findings/consolidate";

async function main() {
  const apply = process.argv.includes("--apply");
  const localizedOnly = process.argv.includes("--localized-only");
  const siteId = process.argv.find((arg) => arg.startsWith("--site-id="))?.slice("--site-id=".length);
  if (siteId === "") throw new Error("Provide a site ID with --site-id=<id>");
  const scans = await prisma.scan.findMany({
    where: {
      status: "COMPLETE", scanType: { not: "TEXT_SEARCH" },
      siteId,
      ...(localizedOnly ? { pages: { some: { requestedProvince: { not: null } } } } : {}),
    },
    orderBy: { startedAt: "asc" },
    select: { id: true, scoreA11y: true, scoreOverall: true },
  });
  for (const scan of scans) {
    const { id } = scan;
    if (apply) {
      await consolidateProvincialFindings(id);
      await ensureScanFindingFingerprints(id);
    }
    const scores = await computeScanScores(id);
    if (apply) await prisma.scan.update({ where: { id }, data: scores });
    if (siteId) {
      console.log(id, { accessibility: [scan.scoreA11y, scores.scoreA11y], overall: [scan.scoreOverall, scores.scoreOverall] });
    }
  }
  console.log(`${apply ? "Rescored" : "Validated"} ${scans.length} completed scans. Use --apply to persist.`);
}

main().finally(() => prisma.$disconnect());
