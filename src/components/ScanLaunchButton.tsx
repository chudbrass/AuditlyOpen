"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PROVINCE_NAMES, type Province } from "@/lib/crawler/provinces";

export default function ScanLaunchButton({
  siteId, availableProvinces, textSearch = false,
}: {
  siteId: string;
  availableProvinces: readonly Province[];
  textSearch?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [provinces, setProvinces] = useState(availableProvinces);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supportsProvinces = availableProvinces.length > 0;
  const allSelected = provinces.length === availableProvinces.length;
  const canStart = !starting && (!textSearch || !!query.trim()) && (!supportsProvinces || provinces.length > 0);
  const title = textSearch ? "Text Search" : "Run full crawl";

  function openDialog() {
    setQuery("");
    setProvinces(availableProvinces);
    setError(null);
    dialog.current?.showModal();
  }

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStart) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/${textSearch ? "text-search" : "scans"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: textSearch ? query : undefined,
          provinces: supportsProvinces ? provinces : undefined,
        }),
      });
      const body = await response.json().catch(() => null) as { error?: string; scanId?: string } | null;
      if (!response.ok || (textSearch && !body?.scanId)) {
        setError(body?.error ?? "Could not start the scan.");
        return;
      }
      dialog.current?.close();
      if (textSearch) router.push(`/sites/${siteId}/scans/${body?.scanId}`);
      else router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className={`ui-button px-3 py-1.5 text-sm ${textSearch
          ? "border border-blue-200 bg-blue-50 font-medium text-blue-700 hover:bg-blue-100"
          : "bg-gray-900 text-white hover:bg-gray-700"}`}
      >
        {title}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={(event) => { if (starting) event.preventDefault(); }}
        className="max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl backdrop:bg-gray-950/45"
      >
        <form onSubmit={startScan}>
          <h2 id={titleId} className="text-lg font-semibold text-gray-950">{title}</h2>
          {textSearch && (
            <label className="mt-4 block text-sm font-medium text-gray-800">
              Text to find
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Enter a word or phrase"
                maxLength={250}
                required
                autoFocus
                readOnly={starting}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-100"
              />
            </label>
          )}
          {supportsProvinces && (
            <fieldset disabled={starting} className="mt-4 text-sm text-gray-800">
              <legend className="font-medium">Provinces to scan</legend>
              <label className="flex min-h-8 items-center gap-2 border-b border-gray-200 font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = !allSelected && provinces.length > 0;
                  }}
                  onChange={(event) => setProvinces(event.target.checked ? availableProvinces : [])}
                />
                All provinces
              </label>
              <div className="mt-2 grid grid-cols-1 gap-x-3 min-[380px]:grid-cols-2">
                {availableProvinces.map((province) => (
                  <label key={province} className="flex min-h-8 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={provinces.includes(province)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setProvinces((selected) => checked ? [...selected, province] : selected.filter((code) => code !== province));
                      }}
                    />
                    {PROVINCE_NAMES[province]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={starting} onClick={() => dialog.current?.close()} className="ui-button border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={!canStart} className="ui-button bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {starting ? "Starting…" : "Start scan"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
