import Link from "next/link";
import SiteForm from "@/components/SiteForm";
import { getGlobalSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NewSitePage() {
  const settings = await getGlobalSettings();
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-12">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Add site</h1>
      <div className="mt-6">
        <SiteForm initial={{
          maxPages: settings.defaultMaxPages,
        }} />
      </div>
    </main>
  );
}
