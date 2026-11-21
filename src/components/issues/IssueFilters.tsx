"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  CATEGORY_LABELS,
  CONFORMANCE_LABELS,
  SEVERITY_LABELS,
  ROLE_LABELS,
  ELEMENT_TYPE_LABELS,
} from "@/lib/ui/colors";

export interface SiteOption {
  id: string;
  name: string;
}

interface FilterSelectProps {
  label: string;
  param: string;
  value: string;
  options: [value: string, label: string][];
  allLabel: string;
  onChange: (param: string, value: string) => void;
}

function FilterSelect({ label, param, value, options, allLabel, onChange }: FilterSelectProps) {
  return (
    <label className="flex w-full flex-col gap-1 text-[11px] font-medium text-gray-500 sm:min-w-[150px] sm:flex-1 lg:w-auto">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(param, e.target.value)}
        className={`h-8 rounded-lg border bg-white px-2 text-xs font-medium focus:border-blue-500 focus:outline-none ${
          value ? "border-blue-400 text-blue-700" : "border-gray-200 text-gray-700"
        }`}
      >
        <option value="">{allLabel}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// De-duplicate QA/BP which share the "Best Practice" label.
const CONFORMANCE_OPTIONS: [string, string][] = Object.entries(CONFORMANCE_LABELS).filter(
  ([value]) => value !== "BP"
);

export default function IssueFilters({ sites }: { sites: SiteOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParam(param: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete("page"); // filter change resets pagination
    startTransition(() => router.push(`/issues?${next.toString()}`));
  }

  const activeCount = ["site", "category", "conf", "sev", "role", "el", "q"].filter((p) =>
    searchParams.get(p)
  ).length;

  return (
    <div
      className={`flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <FilterSelect
        label="Site"
        param="site"
        value={searchParams.get("site") ?? ""}
        options={sites.map((s) => [s.id, s.name])}
        allLabel="All sites"
        onChange={setParam}
      />
      <FilterSelect
        label="Category"
        param="category"
        value={searchParams.get("category") ?? ""}
        options={Object.entries(CATEGORY_LABELS)}
        allLabel="All categories"
        onChange={setParam}
      />
      <FilterSelect
        label="Conformance"
        param="conf"
        value={searchParams.get("conf") ?? ""}
        options={CONFORMANCE_OPTIONS}
        allLabel="All levels"
        onChange={setParam}
      />
      <FilterSelect
        label="Severity"
        param="sev"
        value={searchParams.get("sev") ?? ""}
        options={Object.entries(SEVERITY_LABELS).map(([v, l]) => [v.toUpperCase(), l])}
        allLabel="All severities"
        onChange={setParam}
      />
      <FilterSelect
        label="Responsible role"
        param="role"
        value={searchParams.get("role") ?? ""}
        options={Object.entries(ROLE_LABELS)}
        allLabel="All roles"
        onChange={setParam}
      />
      <FilterSelect
        label="Element type"
        param="el"
        value={searchParams.get("el") ?? ""}
        options={Object.entries(ELEMENT_TYPE_LABELS)}
        allLabel="All elements"
        onChange={setParam}
      />
      <label className="flex w-full min-w-0 flex-col gap-1 text-[11px] font-medium text-gray-500 sm:min-w-[180px] sm:flex-1">
        Search
        <input
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Message or rule code…"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim());
          }}
          className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:border-blue-500 focus:outline-none"
        />
      </label>
      {activeCount > 0 && (
        <button
          onClick={() => startTransition(() => router.push("/issues"))}
          className="ui-button h-8 w-full px-3 text-xs font-medium text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50 sm:w-auto"
        >
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  );
}
