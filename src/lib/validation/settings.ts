import { z } from "zod";

export const GLOBAL_SETTINGS_DEFAULTS = {
  userAgent: "AuditlyBot/1.0",
  defaultMaxPages: 1000,
  scanRetentionDays: 90,
  alertsEnabled: true,
} as const;

export const globalSettingsSchema = z.object({
  userAgent: z.string().trim().min(1, "User agent is required"),
  defaultMaxPages: z.coerce.number().int().min(1, "Must be at least 1"),
  scanRetentionDays: z.coerce.number().int().min(1, "Must be at least 1"),
  alertsEnabled: z.boolean(),
});

export type GlobalSettings = z.infer<typeof globalSettingsSchema>;
