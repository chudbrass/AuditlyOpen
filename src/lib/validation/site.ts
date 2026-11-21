import { z } from "zod";
import { isValidCron, isValidTimezone } from "@/lib/scan/cron";
import { isRequestUrlAllowed } from "@/lib/crawler/urlFilters";

const crawlUrl = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .refine(isRequestUrlAllowed, "Private-network URLs are not allowed");

export const siteInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  rootUrl: crawlUrl,
  seedUrls: z.array(crawlUrl).default([]),
  includePatterns: z.array(z.string().trim().min(1)).default([]),
  excludePatterns: z.array(z.string().trim().min(1)).default([]),
  maxPages: z.coerce.number().int().min(1).max(100_000).default(1000),
  concurrency: z.coerce.number().int().min(1).max(50).default(5),
  checkExternalLinks: z.coerce.boolean().default(true),
  spellcheckEnabled: z.coerce.boolean().default(false),
  allowedSpellingWords: z.array(z.string().trim().min(1).max(100)).default([]),
  scheduleCron: z
    .string()
    .trim()
    .min(1)
    .refine(isValidCron, "Must be a valid 5-field cron expression (e.g. \"0 6 * * *\")")
    .nullable()
    .optional(),
  scheduleTimezone: z.string().trim().refine(isValidTimezone, "Must be a valid IANA timezone").default("UTC"),
});

export type SiteInput = z.infer<typeof siteInputSchema>;

export const siteUpdateSchema = siteInputSchema.partial();
