"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SiteOrderControlsProps {
  siteIds: string[];
  siteId: string;
  siteName: string;
  className?: string;
}

export default function SiteOrderControls({
  siteIds,
  siteId,
  siteName,
  className = "",
}: SiteOrderControlsProps) {
  const router = useRouter();
  const [pendingDirection, setPendingDirection] = useState<"earlier" | "later" | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const index = siteIds.indexOf(siteId);

  if (siteIds.length < 2 || index === -1) return null;

  const busy = pendingDirection !== null || isRefreshing;
  const buttonClass =
    "flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-35";

  async function move(delta: -1 | 1, direction: "earlier" | "later") {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= siteIds.length) return;

    setError(false);
    setPendingDirection(direction);
    const nextSiteIds = siteIds.slice();
    [nextSiteIds[index], nextSiteIds[nextIndex]] = [nextSiteIds[nextIndex], nextSiteIds[index]];

    const res = await fetch("/api/sites/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteIds: nextSiteIds }),
    });

    if (!res.ok) {
      setError(true);
      setPendingDirection(null);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
    setPendingDirection(null);
  }

  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`} aria-label="Site order controls">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void move(-1, "earlier");
        }}
        disabled={busy || index === 0}
        className={buttonClass}
        aria-label={`Move ${siteName} earlier`}
        title={`Move ${siteName} earlier`}
      >
        {pendingDirection === "earlier" ? "..." : "^"}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void move(1, "later");
        }}
        disabled={busy || index === siteIds.length - 1}
        className={buttonClass}
        aria-label={`Move ${siteName} later`}
        title={`Move ${siteName} later`}
      >
        {pendingDirection === "later" ? "..." : "v"}
      </button>
      {error && (
        <span className="sr-only" role="status">
          Could not save site order.
        </span>
      )}
    </div>
  );
}
