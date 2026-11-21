"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/alerts/read-all", { method: "POST" });
    if (res.ok) {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className="ui-button bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
    >
      {loading ? "Marking…" : "Mark all read"}
    </button>
  );
}
