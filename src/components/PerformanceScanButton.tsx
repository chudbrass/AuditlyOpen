"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PerformanceScanButtonProps {
  siteId: string;
  disabled?: boolean;
}

interface PerformancePageOption {
  url: string;
  title: string | null;
}

export default function PerformanceScanButton({
  siteId,
  disabled = false,
}: PerformanceScanButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<PerformancePageOption[]>([]);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [loadingPages, setLoadingPages] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingPages(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/sites/${siteId}/performance-scans?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const body = (await response.json().catch(() => null)) as
          | { pages?: PerformancePageOption[]; error?: string }
          | null;
        if (!response.ok) {
          setPages([]);
          setError(body?.error ?? "Could not load pages from the latest crawl");
          return;
        }
        setPages(body?.pages ?? []);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError("Could not load pages from the latest crawl");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingPages(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, siteId]);

  function closeDialog(force = false) {
    if (starting && !force) return;
    setOpen(false);
    setQuery("");
    setPages([]);
    setSelectedUrl("");
    setError(null);
  }

  async function startScan() {
    if (!selectedUrl) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/performance-scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: selectedUrl }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Failed to start performance scan");
        return;
      }
      closeDialog(true);
      router.refresh();
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
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="ui-button border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
      >
        Run performance scan
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeDialog();
            }
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="performance-scan-title"
            className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="performance-scan-title" className="text-lg font-semibold text-gray-950">
                  Choose one page to test
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Lighthouse runs only on the selected page. Its result stays separate from site health scores.
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeDialog()}
                disabled={starting}
                aria-label="Close performance scan dialog"
                className="rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <label htmlFor="performance-page-search" className="mt-5 block text-sm font-medium text-gray-800">
              Search crawled pages
            </label>
            <input
              id="performance-page-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by page title or URL"
              autoFocus
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-200" aria-live="polite">
              {loadingPages ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">Loading pages…</p>
              ) : pages.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">No matching crawled pages.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pages.map((page) => {
                    const selected = selectedUrl === page.url;
                    return (
                      <li key={page.url}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedUrl(page.url)}
                          className={`w-full px-4 py-3 text-left transition ${
                            selected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : "hover:bg-gray-50"
                          }`}
                        >
                          <span className="block truncate text-sm font-medium text-gray-900">
                            {page.title || "Untitled page"}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">{page.url}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selectedUrl && (
              <p className="mt-3 truncate text-xs text-gray-500" title={selectedUrl}>
                Selected: <span className="font-mono text-gray-700">{selectedUrl}</span>
              </p>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeDialog()}
                disabled={starting}
                className="ui-button border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startScan}
                disabled={!selectedUrl || starting}
                className="ui-button bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {starting ? "Starting…" : "Run Lighthouse"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
