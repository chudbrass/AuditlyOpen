import { prisma } from "@/lib/db";
import { CANADIAN_PROVINCES } from "@/lib/crawler/provinces";
import Link from "next/link";

export default async function LocaleCoverage({
  scanId, scanProvinces, reportPath,
}: {
  scanId: string;
  scanProvinces: string[];
  reportPath?: string;
}) {
  const [pages, findings] = await Promise.all([
    prisma.page.groupBy({
      by: ["requestedProvince", "language", "status"],
      where: { scanId, requestedProvince: { not: null }, OR: [
        { status: { not: "REDIRECTED" } }, { fetchError: { not: null } },
      ] },
      _count: { _all: true },
    }),
    prisma.finding.groupBy({
      by: ["province", "language"],
      where: { scanId, province: { not: null } },
      _count: { _all: true },
    }),
  ]);
  if (pages.length === 0 && scanProvinces.length === 0) return null;
  const provinces = scanProvinces.length > 0 ? scanProvinces : CANADIAN_PROVINCES;

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">Province and language coverage</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              {["Province", "English pages", "English issues", "French pages", "French issues", "Language unknown", "Failed or skipped"].map((label) => (
                <th key={label} scope="col" className="py-2 pr-4 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {provinces.map((province) => {
              const scanned = pages.filter((row) => row.requestedProvince === province && row.status === "FETCHED");
              const failed = pages.filter((row) => row.requestedProvince === province && (row.status === "ERROR" || row.status === "REDIRECTED"))
                .reduce((sum, row) => sum + row._count._all, 0);
              const countPages = (language: string | null) => scanned.find((row) => row.language === language)?._count._all ?? 0;
              const countIssues = (language: string) => findings.find((row) => row.province === province && row.language === language)?._count._all ?? 0;
              const issues = (language: "en" | "fr") => {
                const count = countIssues(language);
                return count > 0 && reportPath
                  ? <Link className="underline" href={{ pathname: reportPath, query: { province, language }, hash: "top-issues" }}>
                      {count.toLocaleString()}
                    </Link>
                  : count.toLocaleString();
              };
              return (
                <tr key={province} className="border-b border-gray-100">
                  <th scope="row" className="py-2 pr-4 font-medium">{province}</th>
                  <td className="py-2 pr-4 tabular-nums">{countPages("en").toLocaleString()}</td>
                  <td className="py-2 pr-4 tabular-nums">{issues("en")}</td>
                  <td className="py-2 pr-4 tabular-nums">{countPages("fr").toLocaleString()}</td>
                  <td className="py-2 pr-4 tabular-nums">{issues("fr")}</td>
                  <td className="py-2 pr-4 tabular-nums">{countPages(null).toLocaleString()}</td>
                  <td className="py-2 pr-4 tabular-nums">{failed.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
