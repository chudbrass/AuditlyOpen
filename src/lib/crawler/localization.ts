import { urlIdentity } from "./urlIdentity";
import { crawlBrand } from "./brand";

export { crawlBrand } from "./brand";

export { CANADIAN_PROVINCES } from "./provinces";

export function localizationSeeds(rootUrl: string): string[] {
  const brand = crawlBrand(rootUrl);
  const paths = brand === "bell" || brand === "aliant" ? ["/", "/Accueil"] :
    brand === "virgin" ? ["/en/home/index.html", "/fr/home/index.html"] : [];
  return paths.map((path) => new URL(path, rootUrl).href);
}

export function pageVariantIdentity(url: string, province: string | null): string {
  return urlIdentity(province ? JSON.stringify([url, province]) : url);
}

export function declaredLanguage(value: string | null): "en" | "fr" | null {
  const primary = value?.trim().toLowerCase().split("-")[0];
  return primary === "en" || primary === "fr" ? primary : null;
}

export function provinceHeaders(rootUrl: string, url: string, province: string | null): Record<string, string> {
  if (!province) return {};
  const brand = crawlBrand(rootUrl);
  const { pathname } = new URL(url);
  if (brand === "bell" || brand === "aliant") {
    // Bell's localized URLs choose the language. Supply a language preference on homepages.
    const language = /^\/accueil\/?$/i.test(pathname) ? "fr" : pathname === "/" ? "en" : "";
    return {
      Cookie: `gemini=region=${province}|language=${language}|province=${province}|LarSegmentType=`,
      ...(language ? { "Accept-Language": `${language}-CA` } : {}),
    };
  }
  if (brand === "virgin") {
    const language = declaredLanguage(pathname.split("/")[1] ?? null);
    return { Cookie: `province=${province}`, ...(language ? { "Accept-Language": `${language}-CA` } : {}) };
  }
  return {};
}

export function provinceFallbackUrl(rootUrl: string, url: string, province: string): string | null {
  const brand = crawlBrand(rootUrl);
  if (!brand) return null;
  const requestedUrl = new URL(url);
  const isVirgin = brand === "virgin";
  requestedUrl.searchParams.set(isVirgin ? "province" : "prov", isVirgin ? province : province.toLowerCase());
  return requestedUrl.href === url ? null : requestedUrl.href;
}
