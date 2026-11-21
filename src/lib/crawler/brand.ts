import { CANADIAN_PROVINCES, type Province } from "./provinces";

const ATLANTIC_PROVINCES = ["NB", "NL", "NS", "PE"] as const;

export function crawlBrand(rootUrl: string): "bell" | "aliant" | "virgin" | null {
  if (!URL.canParse(rootUrl)) return null;
  const hostname = new URL(rootUrl).hostname.replace(/^www\./, "");
  if (hostname === "bell.ca") return "bell";
  if (hostname === "aliant.bell.ca") return "aliant";
  if (hostname === "virginplus.ca") return "virgin";
  return null;
}

export function siteProvinces(rootUrl: string): readonly Province[] {
  const brand = crawlBrand(rootUrl);
  if (brand === "aliant") return ATLANTIC_PROVINCES;
  return brand ? CANADIAN_PROVINCES : [];
}
