export type LogContext = {
  scanId?: string;
  pageId?: string;
  jobId?: string;
  queue?: string;
  siteId?: string;
  [key: string]: unknown;
};

function write(level: "info" | "warn" | "error", message: string, context: LogContext = {}): void {
  const record = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...context });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(record);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
