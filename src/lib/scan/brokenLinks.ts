import type { Link, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function getBrokenLinkPairs(scanId: string) {
  return prisma.link.groupBy({ by: ["sourceUrl", "targetUrl"], where: { scanId, broken: true } });
}

export async function listBrokenLinks(
  scanId: string,
  { type, cursor, take, localized }: { type?: string | null; cursor?: string; take: number; localized: boolean }
) {
  const where: Prisma.LinkWhereInput = {
    scanId, broken: true,
    ...(type === "internal" || type === "external" ? { isInternal: type === "internal" } : {}),
  };
  if (!localized) {
    return prisma.link.findMany({
      where, orderBy: { id: "asc" }, take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  const pairs = await prisma.link.groupBy({
    by: ["sourceUrl", "targetUrl"],
    where,
    _min: { id: true },
    orderBy: { _min: { id: "asc" } },
    ...(cursor ? { having: { id: { _min: { gt: cursor } } } } : {}),
    take,
  });
  if (!pairs.length) return [];
  const observations = await prisma.link.findMany({
    where: { ...where, OR: pairs.map(({ sourceUrl, targetUrl }) => ({ sourceUrl, targetUrl })) },
    include: { sourcePage: { select: { province: true } } },
  });
  const provincesByPair = new Map<string, Set<string>>();
  const byId = new Map<string, Link>();
  for (const { sourcePage, ...link } of observations) {
    byId.set(link.id, link);
    if (!sourcePage?.province) continue;
    const key = JSON.stringify([link.sourceUrl, link.targetUrl]);
    const provinces = provincesByPair.get(key) ?? new Set<string>();
    provinces.add(sourcePage.province);
    provincesByPair.set(key, provinces);
  }
  return pairs.flatMap(({ sourceUrl, targetUrl, _min }) => {
    const link = _min.id ? byId.get(_min.id) : undefined;
    if (!link) return [];
    return [{ ...link, affectedProvinces: [...(provincesByPair.get(JSON.stringify([sourceUrl, targetUrl])) ?? [])].sort() }];
  });
}
