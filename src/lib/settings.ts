import { prisma } from "@/lib/db";
import {
  GLOBAL_SETTINGS_DEFAULTS,
  globalSettingsSchema,
  type GlobalSettings,
} from "@/lib/validation/settings";

export const GLOBAL_SETTINGS_KEY = "global";
const CACHE_TTL_MS = 15_000;
let cached: { value: GlobalSettings; expiresAt: number } | null = null;

export async function getGlobalSettings(now = Date.now()): Promise<GlobalSettings> {
  if (cached && cached.expiresAt > now) return cached.value;
  const row = await prisma.appSetting.findUnique({ where: { key: GLOBAL_SETTINGS_KEY } });
  const candidate = {
    ...GLOBAL_SETTINGS_DEFAULTS,
    ...(row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value : {}),
  };
  const parsed = globalSettingsSchema.safeParse(candidate);
  const value = parsed.success ? parsed.data : { ...GLOBAL_SETTINGS_DEFAULTS };
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function saveGlobalSettings(value: GlobalSettings): Promise<GlobalSettings> {
  const parsed = globalSettingsSchema.parse(value);
  await prisma.appSetting.upsert({
    where: { key: GLOBAL_SETTINGS_KEY },
    create: { key: GLOBAL_SETTINGS_KEY, value: parsed },
    update: { value: parsed },
  });
  cached = { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS };
  return parsed;
}

export function clearSettingsCache(): void {
  cached = null;
}
