"use client";

import { useEffect, useState } from "react";

type Check = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED";
  issuePresent: boolean | null;
  error: string | null;
  tasksCompleted: number;
};

export default function RecheckIssueButton({ findingId }: { findingId: string }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!check || (check.status !== "QUEUED" && check.status !== "RUNNING")) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/item-checks/${check.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { check: Check };
      setCheck(body.check);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [check]);

  async function start() {
    setStarting(true);
    try {
      const response = await fetch(`/api/findings/${findingId}/recheck`, { method: "POST" });
      const body = (await response.json()) as { check?: Check; error?: string };
      setCheck(body.check ?? { id: "", status: "FAILED", issuePresent: null, error: body.error ?? "Unable to start recheck.", tasksCompleted: 0 });
    } catch {
      setCheck({ id: "", status: "FAILED", issuePresent: null, error: "Unable to start recheck.", tasksCompleted: 0 });
    } finally {
      setStarting(false);
    }
  }

  if (check?.status === "COMPLETE") {
    return check.issuePresent ? (
      <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-amber-800 ring-1 ring-amber-200">Still present</span>
    ) : (
      <span className="rounded-lg bg-green-50 px-3 py-1.5 font-medium text-green-800 ring-1 ring-green-200">
        Fixed{check.tasksCompleted > 0 ? ` · ${check.tasksCompleted} task${check.tasksCompleted === 1 ? "" : "s"} completed` : ""}
      </span>
    );
  }
  if (check?.status === "FAILED") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <button onClick={start} className="rounded-lg bg-red-50 px-3 py-1.5 font-medium text-red-700 ring-1 ring-red-200">
          Check failed · retry
        </button>
        {check.error && <span className="max-w-xl text-[11px] text-red-700">{check.error}</span>}
      </span>
    );
  }
  return (
    <button onClick={start} disabled={starting || check?.status === "QUEUED" || check?.status === "RUNNING"} className="rounded-lg bg-blue-50 px-3 py-1.5 font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 disabled:opacity-60">
      {starting || check?.status === "QUEUED" ? "Queueing…" : check?.status === "RUNNING" ? "Checking…" : "Check fix"}
    </button>
  );
}
