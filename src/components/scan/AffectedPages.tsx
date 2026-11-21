"use client";

import { useId, useState } from "react";

type Page = { url: string; provinces: string[] };

function pagePath(url: string) {
  try {
    const page = new URL(url);
    return page.pathname + page.search;
  } catch {
    return url;
  }
}

export default function AffectedPages({
  sample,
  count,
  endpoint,
}: {
  sample: Page[];
  count: number;
  endpoint?: string;
}) {
  const listId = useId();
  const [allPages, setAllPages] = useState<Page[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const pages = expanded && allPages ? allPages : sample;
  const hasMore = sample.length < count;

  async function togglePages() {
    if (expanded || allPages) {
      setExpanded(!expanded);
      return;
    }
    if (!endpoint) return;

    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("Could not load affected pages");
      const { pages }: { pages: Page[] } = await response.json();
      setAllPages(pages);
      setExpanded(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="font-semibold text-gray-600" role="status">
          Affected pages{expanded ? ` (${pages.length.toLocaleString()})` : hasMore
            ? ` (showing ${sample.length} of ${count.toLocaleString()})`
            : ""}
        </div>
        {endpoint && hasMore && (
          <button
            type="button"
            aria-controls={listId}
            aria-expanded={expanded}
            aria-disabled={loading}
            onClick={loading ? undefined : togglePages}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 aria-disabled:opacity-60"
          >
            {loading ? "Loading pages…" : expanded ? "Show fewer pages" : "Show all pages"}
          </button>
        )}
      </div>
      {failed && <p role="alert" className="mt-1 text-red-700">Couldn’t load all pages. Try again.</p>}
      <ul id={listId} className="mt-1 space-y-0.5">
        {pages.map(({ url, provinces }) => (
          <li key={url} className="flex flex-wrap gap-x-2">
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline" title={url}>
              {pagePath(url)}
            </a>
            {provinces.length > 0 && (
              <span className="text-gray-500">Provinces · {provinces.join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
