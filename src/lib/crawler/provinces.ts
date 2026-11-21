export const CANADIAN_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"] as const;

export type Province = (typeof CANADIAN_PROVINCES)[number];

export const PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
};

export function provinceScopeLabel(provinces: readonly string[]): string {
  return CANADIAN_PROVINCES.every((province) => provinces.includes(province))
    ? "All provinces"
    : provinces.map((province) => PROVINCE_NAMES[province] ?? province).join(", ");
}
