"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteSiteButton({ siteId }: { siteId: string }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this site and all its data? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not delete the site. Please try again.");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="ui-button bg-white px-3 py-1.5 text-sm text-red-700 ring-1 ring-red-200 hover:bg-red-50"
      >
        {deleting ? "Deleting…" : "Delete site"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
