import { prisma } from "@/lib/db";
import SettingsForm from "@/components/settings/SettingsForm";
import { GLOBAL_SETTINGS_DEFAULTS, globalSettingsSchema } from "@/lib/validation/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const stored = await prisma.appSetting.findUnique({ where: { key: "global" } });
  const merged = {
    ...GLOBAL_SETTINGS_DEFAULTS,
    ...(stored?.value && typeof stored.value === "object" ? stored.value : {}),
  };
  const parsed = globalSettingsSchema.safeParse(merged);
  const initial = parsed.success ? parsed.data : GLOBAL_SETTINGS_DEFAULTS;

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Global defaults for crawling, retention, and notifications.</p>

      <SettingsForm initial={initial} />
    </div>
  );
}
