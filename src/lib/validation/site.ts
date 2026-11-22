import { z } from "zod";
import { isValidCron, isValidTimezone } from "@/lib/scan/cron";
import { isRequestUrlAllowed } from "@/lib/crawler/urlFilters";

const crawlUrl = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .refine(isRequestUrlAllowed, "Use an HTTP(S) URL without embedded credentials or private-network addresses");

const siteFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  rootUrl: crawlUrl,
  seedUrls: z.array(crawlUrl),
  includePatterns: z.array(z.string().trim().min(1)),
  excludePatterns: z.array(z.string().trim().min(1)),
  maxPages: z.coerce.number().int().min(1).max(100_000),
  concurrency: z.coerce.number().int().min(1).max(50),
  checkExternalLinks: z.coerce.boolean(),
  spellcheckEnabled: z.coerce.boolean(),
  allowedSpellingWords: z.array(z.string().trim().min(1).max(100)),
  scheduleCron: z
    .string()
    .trim()
    .min(1)
    .refine(isValidCron, "Must be a valid 5-field cron expression (e.g. \"0 6 * * *\")")
    .nullable()
    .optional(),
  scheduleTimezone: z.string().trim().refine(isValidTimezone, "Must be a valid IANA timezone"),
};

export const siteInputSchema = z.object({
  ...siteFields,
  seedUrls: siteFields.seedUrls.default([]),
  includePatterns: siteFields.includePatterns.default([]),
  excludePatterns: siteFields.excludePatterns.default([]),
  maxPages: siteFields.maxPages.default(1000),
  concurrency: siteFields.concurrency.default(5),
  checkExternalLinks: siteFields.checkExternalLinks.default(true),
  spellcheckEnabled: siteFields.spellcheckEnabled.default(false),
  allowedSpellingWords: siteFields.allowedSpellingWords.default([]),
  scheduleTimezone: siteFields.scheduleTimezone.default("UTC"),
});

export type SiteInput = z.infer<typeof siteInputSchema>;

export const siteUpdateSchema = z.object(siteFields).partial();
