const RESULT_PREFIX = "__AUDITLY_LIGHTHOUSE_RESULT__";

function emptyMetrics() {
  return { lcp: null, cls: null, tbt: null, fcp: null, speedIndex: null };
}

function numericValue(audits, id) {
  const value = audits[id]?.numericValue;
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : null;
}

function emit(result) {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
}

async function main() {
  const url = process.argv[2];
  const port = Number(process.argv[3]);
  const requestedTimeoutMs = Number(process.argv[4]);
  const timeoutMs = Number.isFinite(requestedTimeoutMs) ? requestedTimeoutMs : 90_000;

  if (!url) throw new Error("URL argument is required");
  if (!Number.isFinite(port)) throw new Error("CDP port argument is required");
  if (process.env.AUDITLY_BROWSER_EGRESS_PROXY_ENFORCED !== "true") {
    throw new Error("Lighthouse requires Auditly's egress-enforcing browser proxy");
  }
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error("Blocked unsafe Lighthouse URL");
  }

  const { default: lighthouse } = await import("lighthouse");
  const empty = emptyMetrics();

  const run = lighthouse(url, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"],
    skipAudits: ["script-treemap-data", "valid-source-maps"],
    maxWaitForLoad: Math.min(timeoutMs, 45_000),
    // Mobile is Lighthouse's default form factor; keep it explicit per the phase spec.
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  });

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Lighthouse timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  const result = await Promise.race([run, timeout]).finally(() => clearTimeout(timer));

  if (!result) {
    emit({ perfScore: null, metrics: empty, error: "Lighthouse returned no result" });
    return;
  }

  const lhr = result.lhr;
  const rawScore = lhr.categories.performance?.score;
  const audits = lhr.audits;

  emit({
    perfScore: typeof rawScore === "number" ? Math.round(rawScore * 100) : null,
    metrics: {
      lcp: numericValue(audits, "largest-contentful-paint"),
      cls: numericValue(audits, "cumulative-layout-shift"),
      tbt: numericValue(audits, "total-blocking-time"),
      fcp: numericValue(audits, "first-contentful-paint"),
      speedIndex: numericValue(audits, "speed-index"),
    },
    error: null,
  });
}

main().catch((err) => {
  emit({
    perfScore: null,
    metrics: emptyMetrics(),
    error: err instanceof Error ? err.message : String(err),
  });
});
