"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PriorityBadge } from "./priorityBadge";
import { TaskDTO, TaskStatus } from "./types";

const STATUS_ORDER: TaskStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? "?"];
  return chars.join("").toUpperCase();
}

export default function TaskCard({ task }: { task: TaskDTO }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentIndex = STATUS_ORDER.indexOf(task.status);
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex < STATUS_ORDER.length - 1;

  const isOverdue =
    task.dueAt !== null && new Date(task.dueAt) < new Date() && task.status !== "COMPLETED";

  async function patch(body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Update failed");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Update failed");
    }
  }

  function move(direction: -1 | 1) {
    const nextStatus = STATUS_ORDER[currentIndex + direction];
    if (!nextStatus) return;
    void patch({ status: nextStatus });
  }

  async function handleDelete() {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Delete failed");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Delete failed");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-gray-900">{task.title}</div>
        <PriorityBadge priority={task.priority} />
      </div>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{task.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.site && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {task.site.name}
          </span>
        )}
        {task.findingCode && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
            {task.findingCode}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.assignee ? (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[9px] font-semibold text-blue-700">
                {initials(task.assignee.name)}
              </span>
              <span className="text-xs text-gray-500">{task.assignee.name}</span>
            </>
          ) : (
            <span className="text-xs text-gray-400">Unassigned</span>
          )}
        </div>
        {task.dueAt && (
          <span className={`text-[11px] ${isOverdue ? "font-medium text-red-600" : "text-gray-400"}`}>
            {new Date(task.dueAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && <div className="mt-2 text-[11px] text-red-600">{error}</div>}

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canMoveLeft || isPending}
            onClick={() => move(-1)}
            className="ui-button border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30"
            aria-label="Move to previous status"
          >
            ←
          </button>
          <button
            type="button"
            disabled={!canMoveRight || isPending}
            onClick={() => move(1)}
            className="ui-button border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30"
            aria-label="Move to next status"
          >
            →
          </button>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
