"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface WordItem { word: string; count: number }

export default function SpellingWordList({ siteId, words, allowedWords }: {
  siteId: string;
  words: WordItem[];
  allowedWords: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const allowed = new Set(allowedWords.map((word) => word.toLocaleLowerCase()));

  async function allowWord(word: string) {
    setSaving(word);
    try {
      const response = await fetch(`/api/sites/${siteId}/spelling-words`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word }),
      });
      if (!response.ok) throw new Error("Could not save word");
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="font-semibold text-gray-700">Flagged words</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {words.map(({ word, count }) => {
          const isAllowed = allowed.has(word.toLocaleLowerCase());
          return (
            <div key={word} className={`inline-flex items-center overflow-hidden rounded-lg ring-1 ${isAllowed ? "bg-gray-50 text-gray-500 ring-gray-200" : "bg-amber-50 text-amber-950 ring-amber-200"}`}>
              <span className="px-2.5 py-1.5 font-mono text-sm font-semibold">{word}{count > 1 ? ` ×${count}` : ""}</span>
              {isAllowed ? (
                <span className="border-l border-gray-200 px-2 py-1.5 text-[11px] font-medium">Allowed</span>
              ) : (
                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => allowWord(word)}
                  className="border-l border-amber-200 px-2 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  title={`Treat ${word} as valid for this site`}
                >
                  {saving === word ? "Saving…" : "Ignore"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Allowed words are site-specific and will be ignored in future scans.</p>
    </div>
  );
}
