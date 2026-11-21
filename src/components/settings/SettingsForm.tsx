"use client";

import { useState } from "react";
import type { GlobalSettings } from "@/lib/validation/settings";

export default function SettingsForm({ initial }: { initial: GlobalSettings }) {
  const [values, setValues] = useState<GlobalSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        typeof body.error === "string" ? body.error : body.error?.formErrors?.[0] ?? "Failed to save settings"
      );
      return;
    }

    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900">Crawler defaults</h2>
        <p className="mt-1 text-xs text-gray-500">
          Applied to newly created sites; per-site settings override.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600">User agent</label>
            <input
              value={values.userAgent}
              onChange={(e) => update("userAgent", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Default max pages</label>
            <input
              type="number"
              min={1}
              value={values.defaultMaxPages}
              onChange={(e) => update("defaultMaxPages", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900">Data retention</h2>
        <p className="mt-1 text-xs text-gray-500">How long scan history is kept before pruning.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600">Scan retention (days)</label>
            <input
              type="number"
              min={1}
              value={values.scanRetentionDays}
              onChange={(e) => update("scanRetentionDays", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
        <p className="mt-1 text-xs text-gray-500">Control whether Auditly raises alerts for new findings.</p>

        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={values.alertsEnabled}
            onChange={(e) => update("alertsEnabled", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Enable alerts
        </label>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="ui-button w-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
        >
          {submitting ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm font-medium text-green-600">Saved</span>}
      </div>
    </form>
  );
}
