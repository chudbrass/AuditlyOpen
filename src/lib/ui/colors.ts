// Shared color scales so every chart/card uses the same encoding.

export const CATEGORY_COLORS: Record<string, string> = {
  LINKS: "#3b82f6",
  SEO: "#8b5cf6",
  PERFORMANCE: "#f59e0b",
  A11Y: "#14b8a6",
  QA: "#ec4899",
  SECURITY: "#475569",
};

export const CATEGORY_LABELS: Record<string, string> = {
  LINKS: "Links",
  SEO: "SEO",
  PERFORMANCE: "Performance",
  A11Y: "Accessibility",
  QA: "QA",
  SECURITY: "Security",
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  serious: "#f97316",
  moderate: "#facc15",
  minor: "#60a5fa",
};

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
};

// Conformance buckets from the rule spec (WCAG levels + ARIA/QA/SEO/Best Practice).
export const CONFORMANCE_LABELS: Record<string, string> = {
  A: "WCAG A",
  AA: "WCAG AA",
  AA22: "WCAG 2.2",
  ARIA: "ARIA",
  QA: "Best Practice",
  BP: "Best Practice",
  SEO: "SEO",
  SECURITY: "Security",
};

export const CONFORMANCE_COLORS: Record<string, string> = {
  A: "#dc2626",
  AA: "#ea580c",
  AA22: "#d97706",
  ARIA: "#0891b2",
  QA: "#db2777",
  BP: "#db2777",
  SEO: "#7c3aed",
  SECURITY: "#475569",
};

// Who typically fixes it — drives the triage "responsible role" filter.
export const ROLE_LABELS: Record<string, string> = {
  author: "Content Author",
  developer: "Developer",
  designer: "Designer",
};

export const ELEMENT_TYPE_LABELS: Record<string, string> = {
  images: "Images",
  links: "Links",
  forms: "Forms",
  headings: "Headings",
  tables: "Tables",
  media: "Media",
  aria: "ARIA",
  scripts: "Scripts",
  structure: "Structure",
  metadata: "Metadata",
  content: "Content",
};

export function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

export function scoreLabel(score: number): string {
  if (score >= 90) return "Healthy";
  if (score >= 80) return "Good";
  if (score >= 60) return "Needs attention";
  return "Poor";
}
