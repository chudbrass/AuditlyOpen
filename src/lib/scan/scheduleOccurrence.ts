/** Whether a crawl attempt already exists for this cron occurrence, regardless of outcome. */
export function hasAttemptForOccurrence(
  latestCrawlStartedAt: Date | null | undefined,
  dueAt: Date
): boolean {
  return latestCrawlStartedAt !== null &&
    latestCrawlStartedAt !== undefined &&
    latestCrawlStartedAt >= dueAt;
}
