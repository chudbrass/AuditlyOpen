import * as cheerio from "cheerio";
import { normalizeUrl } from "./urlFilters";

export interface ExtractedLink {
  url: string;
  nofollow: boolean;
}

export interface Heading {
  level: number;
  text: string;
}

export interface ImageRef {
  hasAlt: boolean;
  selector: string;
}

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  headings: Heading[];
  images: ImageRef[];
  canonicalUrl: string | null;
  lang: string | null;
  province: string | null;
  languageAlternates: string[];
  og: { title: boolean; description: boolean; image: boolean };
  links: ExtractedLink[];
}

export function declaredProvince($: cheerio.CheerioAPI): string | null {
  const codes = new Set($('meta[name="province" i]').map((_, element) =>
    ($(element).attr("content") ?? "").trim().toUpperCase()
  ).get());
  return codes.size === 1 ? [...codes][0] || null : null;
}

export function parseHtml(
  htmlOrDocument: string | cheerio.CheerioAPI,
  pageUrl: string
): ParsedPage {
  const $ = typeof htmlOrDocument === "string" ? cheerio.load(htmlOrDocument) : htmlOrDocument;

  const title = $("title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').first().attr("content")?.trim() || null;
  const h1Count = $("h1").length;

  const headings: Heading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    headings.push({ level: Number(el.tagName.slice(1)), text: $(el).text().trim() });
  });

  const images: ImageRef[] = [];
  $("img").each((i, el) => {
    const alt = $(el).attr("alt");
    const src = $(el).attr("src");
    images.push({
      hasAlt: alt !== undefined && alt.trim().length > 0,
      selector: src ? `img[src="${src}"]` : `img:nth-of-type(${i + 1})`,
    });
  });

  const canonicalUrl = $('link[rel="canonical"]').first().attr("href")?.trim() || null;
  const lang = $("html").first().attr("lang")?.trim() || null;
  const province = declaredProvince($);

  const og = {
    title: $('meta[property="og:title"]').length > 0,
    description: $('meta[property="og:description"]').length > 0,
    image: $('meta[property="og:image"]').length > 0,
  };

  const bodyRelNofollow = ($("meta[name='robots']").attr("content") ?? "")
    .toLowerCase()
    .includes("nofollow");
  const languageAlternates = bodyRelNofollow ? [] : $('link[rel~="alternate" i][hreflang][href]').map((_, element) => {
    const language = $(element).attr("hreflang")?.trim().toLowerCase().split("-")[0];
    const href = $(element).attr("href")?.trim();
    return href && (language === "en" || language === "fr") ? normalizeUrl(href, pageUrl) : null;
  }).get();

  const links: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    // Server-rendered pages can leak client-template placeholders into href attributes
    // (for example "{{device.url}}" or "https://{host_name}/"). URL encodes the
    // braces, making these look requestable even though no visitor can follow them until
    // the client framework substitutes a value. Probing them creates phantom 404/DNS
    // findings, so keep unresolved templates out of both discovery and link checking.
    if (href.includes("{") || href.includes("}")) return;
    const url = normalizeUrl(href, pageUrl);
    if (!url) return;
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    links.push({ url, nofollow: bodyRelNofollow || rel.includes("nofollow") });
  });

  return { title, metaDescription, h1Count, headings, images, canonicalUrl, lang, province, languageAlternates, og, links };
}
