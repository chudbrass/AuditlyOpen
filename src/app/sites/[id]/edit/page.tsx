import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import SiteForm from "@/components/SiteForm";
import DeleteSiteButton from "@/components/DeleteSiteButton";

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-12">
      <Link href={`/sites/${site.id}`} className="text-sm text-gray-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{site.name} settings</h1>
      <div className="mt-6">
        <SiteForm
          siteId={site.id}
          initial={{
            name: site.name,
            rootUrl: site.rootUrl,
            seedUrls: site.seedUrls.join("\n"),
            includePatterns: site.includePatterns.join("\n"),
            excludePatterns: site.excludePatterns.join("\n"),
            maxPages: site.maxPages,
            concurrency: site.concurrency,
            checkExternalLinks: site.checkExternalLinks,
            spellcheckEnabled: site.spellcheckEnabled,
            scheduleCron: site.scheduleCron ?? "",
            scheduleTimezone: site.scheduleTimezone,
          }}
        />
      </div>

      <section className="mt-10 rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-sm font-semibold text-red-950">Danger zone</h2>
        <p className="mt-1 text-sm text-red-800">
          Deleting this site permanently removes it and all of its scan history.
        </p>
        <div className="mt-4">
          <DeleteSiteButton siteId={site.id} />
        </div>
      </section>
    </main>
  );
}
