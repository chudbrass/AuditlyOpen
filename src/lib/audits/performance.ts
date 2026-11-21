import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getBrowserCdpPort } from "./browser";

export interface PerfMetrics {
  lcp: number | null; // ms
  cls: number | null;
  tbt: number | null; // ms
  fcp: number | null; // ms
  speedIndex: number | null; // ms
}

export interface PerfResult {
  perfScore: number | null; // 0-100
  metrics: PerfMetrics;
  error: string | null;
}

const AUDIT_TIMEOUT_MS = 90_000;
const RESULT_PREFIX = "__AUDITLY_LIGHTHOUSE_RESULT__";
const RUNNER_PATH = fileURLToPath(new URL("../../../scripts/lighthouse-runner.mjs", import.meta.url));

function getChildHeapMb(): number {
  const parsed = Number(process.env.LIGHTHOUSE_CHILD_HEAP_MB);
  return Number.isFinite(parsed) ? Math.max(256, parsed) : 1536;
}

function emptyMetrics(): PerfMetrics {
  return { lcp: null, cls: null, tbt: null, fcp: null, speedIndex: null };
}

function withChildHeapLimit(existing: string | undefined): string {
  const heapOption = `--max-old-space-size=${getChildHeapMb()}`;
  if (!existing?.trim()) return heapOption;
  if (/\b--max-old-space-size=/.test(existing)) return existing;
  return `${existing} ${heapOption}`;
}

function stderrSummary(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) return "";
  return `: ${trimmed.slice(-1200)}`;
}

function parseChildResult(stdout: string): PerfResult | null {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(RESULT_PREFIX));
  if (!line) return null;

  const parsed = JSON.parse(line.slice(RESULT_PREFIX.length)) as Partial<PerfResult>;
  const metrics = typeof parsed.metrics === "object" && parsed.metrics !== null ? parsed.metrics : {};

  return {
    perfScore: typeof parsed.perfScore === "number" ? parsed.perfScore : null,
    metrics: { ...emptyMetrics(), ...metrics },
    error: typeof parsed.error === "string" ? parsed.error : null,
  };
}

function runLighthouseInChild(url: string, cdpPort: number, signal?: AbortSignal): Promise<PerfResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(process.execPath, [RUNNER_PATH, url, String(cdpPort), String(AUDIT_TIMEOUT_MS)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_OPTIONS: withChildHeapLimit(process.env.NODE_OPTIONS),
        AUDITLY_BROWSER_EGRESS_PROXY_ENFORCED: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result: PerfResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };

    const abort = () => {
      child.kill();
      finish({ perfScore: null, metrics: emptyMetrics(), error: "Lighthouse audit aborted" });
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    const timer = setTimeout(() => {
      child.kill();
      finish({
        perfScore: null,
        metrics: emptyMetrics(),
        error: `Lighthouse timed out after ${AUDIT_TIMEOUT_MS}ms`,
      });
    }, AUDIT_TIMEOUT_MS + 10_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-64_000);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-64_000);
    });

    child.on("error", (err) => {
      finish({ perfScore: null, metrics: emptyMetrics(), error: err.message });
    });

    child.on("close", (code, signal) => {
      if (settled) return;

      try {
        const result = parseChildResult(stdout);
        if (result) {
          finish(result);
          return;
        }
      } catch (err) {
        finish({
          perfScore: null,
          metrics: emptyMetrics(),
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const exit = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      finish({
        perfScore: null,
        metrics: emptyMetrics(),
        error: `Lighthouse child process failed with ${exit}${stderrSummary(stderr)}`,
      });
    });
  });
}

export async function runPerformanceAudit(url: string, signal?: AbortSignal): Promise<PerfResult> {
  try {
    const cdpPort = await getBrowserCdpPort();
    return await runLighthouseInChild(url, cdpPort, signal);
  } catch (err) {
    return {
      perfScore: null,
      metrics: emptyMetrics(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
