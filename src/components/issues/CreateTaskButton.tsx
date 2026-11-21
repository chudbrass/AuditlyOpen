"use client";

import { useState } from "react";

interface Props {
  title: string;
  siteId: string;
  findingCode: string;
  pageUrl: string | null;
  severity: string; // CRITICAL | SERIOUS | MODERATE | MINOR
}

const SEVERITY_TO_PRIORITY: Record<string, string> = {
  CRITICAL: "URGENT",
  SERIOUS: "HIGH",
  MODERATE: "MEDIUM",
  MINOR: "LOW",
};

export default function CreateTaskButton({ title, siteId, findingCode, pageUrl, severity }: Props) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function createTask() {
    setState("saving");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.slice(0, 180),
          priority: SEVERITY_TO_PRIORITY[severity] ?? "MEDIUM",
          siteId,
          findingCode,
          pageUrl,
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <a href="/tasks" className="text-xs font-medium text-green-600 hover:underline">
        ✓ Task created — view board
      </a>
    );
  }

  return (
    <button
      onClick={createTask}
      disabled={state === "saving"}
      className="ui-button bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
    >
      {state === "saving" ? "Creating…" : state === "error" ? "Failed — retry" : "Create task"}
    </button>
  );
}
