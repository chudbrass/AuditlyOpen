import { CronExpressionParser } from "cron-parser";

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

/** Validate a standard five-field cron, including every field's numeric range. */
export function isValidCron(expression: string): boolean {
  if (expression.trim().split(/\s+/).length !== 5) return false;
  try {
    CronExpressionParser.parse(expression, { tz: "UTC" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the latest occurrence in UTC. cron-parser supplies Vixie cron DOM/DOW OR behavior and
 * IANA timezone/DST handling: nonexistent spring-forward wall times are skipped and repeated
 * spring-forward wall times move to the first valid post-transition instant and repeated
 * fall-back wall times retain a stable UTC occurrence identity.
 */
export function latestCronMatch(
  expression: string,
  date: Date,
  timezone = "UTC",
  lookbackMinutes = 32 * 24 * 60
): Date | null {
  if (!isValidTimezone(timezone)) return null;
  try {
    const currentDate = new Date(date.getTime() + 1_000);
    const previous = CronExpressionParser.parse(expression, { currentDate, tz: timezone }).prev().toDate();
    return date.getTime() - previous.getTime() <= lookbackMinutes * 60_000 ? previous : null;
  } catch {
    return null;
  }
}

export function nextCronMatch(expression: string, after: Date, timezone = "UTC"): Date {
  if (!isValidTimezone(timezone)) throw new Error(`Invalid IANA timezone: ${timezone}`);
  return CronExpressionParser.parse(expression, { currentDate: after, tz: timezone }).next().toDate();
}
