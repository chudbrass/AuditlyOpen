import type { CheerioAPI } from "cheerio";

const BLOCK_ELEMENTS = "address,article,aside,blockquote,br,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,td,th,tr,ul";

export function findTextMatches(document: CheerioAPI, query: string) {
  const phrase = query.replace(/\s+/gu, " ").trim();
  const excerpts: { before: string; match: string; after: string }[] = [];
  if (!phrase) return { count: 0, excerpts };

  const body = document("body").clone();
  if (body.is("[hidden]")) return { count: 0, excerpts };
  body.find("script,style,template,noscript,[hidden]").remove();
  body.find(BLOCK_ELEMENTS).each((_, element) => {
    document(element).prepend(" ").append(" ");
  });
  const content = body.text().replace(/\s+/gu, " ").trim();

  const literal = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let count = 0;
  for (const match of content.matchAll(new RegExp(literal, "giu"))) {
    count++;
    if (excerpts.length >= 5) continue;
    const start = match.index;
    const end = start + match[0].length;
    const left = Math.max(0, start - 70);
    const right = Math.min(content.length, end + 70);
    excerpts.push({
      before: (left > 0 ? "…" : "") + content.slice(left, start),
      match: match[0],
      after: content.slice(end, right) + (right < content.length ? "…" : ""),
    });
  }

  return { count, excerpts };
}
