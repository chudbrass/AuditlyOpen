export interface SpellingWord {
  word: string;
  count: number;
}

/** Reads both current structured evidence and legacy `words: ["term (×2)"]` evidence. */
export function spellingWordsFromEvidence(evidence: unknown): SpellingWord[] {
  if (!evidence || typeof evidence !== "object") return [];
  const record = evidence as Record<string, unknown>;
  if (Array.isArray(record.wordCounts)) {
    return record.wordCounts.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      return typeof value.word === "string" && typeof value.count === "number"
        ? [{ word: value.word, count: value.count }]
        : [];
    });
  }
  if (!Array.isArray(record.words)) return [];
  return record.words.flatMap((item) => {
    if (typeof item !== "string") return [];
    const match = item.match(/^(.*?)\s*\(×(\d+)\)$/u);
    return [{ word: (match?.[1] ?? item).trim(), count: match ? Number(match[2]) : 1 }];
  });
}

export function normalizeAllowedSpellingWord(word: string): string {
  return word.trim().toLocaleLowerCase();
}
