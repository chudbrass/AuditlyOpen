"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteScanButton({ scanId, siteId }: { scanId: string; siteId: string }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm("Permanently delete this scan and its results?")) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/scans/${encodeURIComponent(scanId)}`, { method: "DELETE" });
      if (response.ok || response.status === 404) {
        router.replace(`/sites/${siteId}`);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not delete the scan. Please try again.");
    } catch {
      setError("Could not reach the server. Please try again.");
    }
    setDeleting(false);
  }

  return (
    <div className="mt-8 border-t border-gray-200 pt-4">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="ui-button bg-white px-3 py-1.5 text-sm text-red-700 ring-1 ring-red-200 hover:bg-red-50"
      >
        {deleting ? "Deleting…" : "Delete scan"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
