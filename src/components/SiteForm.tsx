"use client";

import { useState } from "react";
import { crawlBrand } from "@/lib/crawler/brand";
import { pageLimitLabel } from "@/lib/scan/constants";

export interface SiteFormValues {
  name: string;
  rootUrl: string;
  seedUrls: string;
  includePatterns: string;
  excludePatterns: string;
  maxPages: number;
  concurrency: number;
  checkExternalLinks: boolean;
  spellcheckEnabled: boolean;
  allowedSpellingWords: string[];
  scheduleCron: string; // "" = manual only
  scheduleTimezone: string;
}

const EMPTY_VALUES: SiteFormValues = {
  name: "",
  rootUrl: "",
  seedUrls: "",
  includePatterns: "",
  excludePatterns: "",
  maxPages: 1000,
  concurrency: 5,
  checkExternalLinks: true,
  spellcheckEnabled: false,
  allowedSpellingWords: [],
  scheduleCron: "",
  scheduleTimezone: "UTC",
};

const SCHEDULE_PRESETS = [
  { label: "Manual only", value: "" },
  { label: "Daily at 1:00 AM", value: "0 1 * * *" },
  { label: "Weekly (Sun 1:00 AM)", value: "0 1 * * 0" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Custom cron…", value: "custom" },
];

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function SiteForm({
  siteId,
  initial,
}: {
  siteId?: string;
  initial?: Partial<SiteFormValues>;
}) {
  const [values, setValues] = useState<SiteFormValues>({ ...EMPTY_VALUES, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initialCron = initial?.scheduleCron ?? "";
  const [customCron, setCustomCron] = useState(
    SCHEDULE_PRESETS.some((p) => p.value === initialCron) ? false : initialCron !== ""
  );
  function update<K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: values.name,
      rootUrl: values.rootUrl,
      seedUrls: linesToArray(values.seedUrls),
      includePatterns: linesToArray(values.includePatterns),
      excludePatterns: linesToArray(values.excludePatterns),
      maxPages: Number(values.maxPages),
      concurrency: Number(values.concurrency),
      checkExternalLinks: values.checkExternalLinks,
      spellcheckEnabled: values.spellcheckEnabled,
      allowedSpellingWords: values.allowedSpellingWords,
      scheduleCron: values.scheduleCron.trim() || null,
      scheduleTimezone: values.scheduleTimezone,
    };

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(siteId ? `/api/sites/${siteId}` : "/api/sites", {
        method: siteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as
        | { site?: { id?: string }; error?: string | Record<string, unknown> }
        | null;

      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Failed to save site");
        return;
      }

      if (!body?.site?.id) {
        setError("The site was saved, but the server returned an invalid response. Refresh the Sites page.");
        return;
      }

      // A full navigation cannot get stranded in a pending App Router transition.
      window.location.assign(`/sites/${body.site.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof DOMException && requestError.name === "AbortError"
          ? "Saving timed out. Check the Sites page before trying again."
          : "Could not reach the server. Please try again."
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input
          required
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Root URL</label>
        <input
          required
          type="url"
          value={values.rootUrl}
          onChange={(e) => update("rootUrl", e.target.value)}
          placeholder="https://example.com"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Seed URLs (one per line, optional)</label>
        <textarea
          value={values.seedUrls}
          onChange={(e) => update("seedUrls", e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 font-mono text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Include patterns (* wildcard, one per line)</label>
          <textarea
            value={values.includePatterns}
            onChange={(e) => update("includePatterns", e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Exclude patterns (* wildcard, one per line)</label>
          <textarea
            value={values.excludePatterns}
            onChange={(e) => update("excludePatterns", e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 font-mono text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="site-page-limit" className="block text-sm font-medium">
            {pageLimitLabel(crawlBrand(values.rootUrl) !== null)}
          </label>
          <input
            id="site-page-limit"
            type="number"
            min={1}
            value={values.maxPages}
            onChange={(e) => update("maxPages", Number(e.target.value))}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Concurrency</label>
          <input
            type="number"
            min={1}
            value={values.concurrency}
            onChange={(e) => update("concurrency", Number(e.target.value))}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Scan schedule</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <select
            value={customCron ? "custom" : values.scheduleCron}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setCustomCron(true);
              } else {
                setCustomCron(false);
                update("scheduleCron", e.target.value);
              }
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            {SCHEDULE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          {customCron && (
            <input
              value={values.scheduleCron}
              onChange={(e) => update("scheduleCron", e.target.value)}
              placeholder="0 1 * * * (min hour dom mon dow)"
              className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm"
            />
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Scheduled scans run from the worker process. Manual &quot;Run full crawl&quot; always works.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium">Schedule timezone</label>
        <input
          value={values.scheduleTimezone}
          onChange={(e) => update("scheduleTimezone", e.target.value)}
          placeholder="America/Toronto"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">IANA timezone; DST transitions follow local civil time.</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.checkExternalLinks}
          onChange={(e) => update("checkExternalLinks", e.target.checked)}
        />
        Check external links
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.spellcheckEnabled}
          onChange={(e) => update("spellcheckEnabled", e.target.checked)}
        />
        Check page copy for potential misspellings
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="ui-button w-full bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 sm:w-auto"
      >
        {submitting ? "Saving…" : siteId ? "Save changes" : "Add site"}
      </button>
    </form>
  );
}
