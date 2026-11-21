import Link from "next/link";
import { prisma } from "@/lib/db";
import type { AlertLevel } from "@prisma/client";
import MarkReadButton from "@/components/alerts/MarkReadButton";
import MarkAllReadButton from "@/components/alerts/MarkAllReadButton";

export const dynamic = "force-dynamic";

interface AlertsPageProps {
  searchParams: Promise<{ level?: string; state?: string; cursor?: string }>;
}

const LEVELS: { value: AlertLevel | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CRITICAL", label: "Critical" },
  { value: "WARNING", label: "Warning" },
  { value: "INFO", label: "Info" },
  { value: "OK", label: "Ok" },
];

const STATES: { value: "ALL" | "UNREAD"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
];

const LEVEL_CHIP: Record<AlertLevel, { className: string; icon: string }> = {
  CRITICAL: { className: "bg-red-100 text-red-600", icon: "▲" },
  WARNING: { className: "bg-amber-100 text-amber-600", icon: "▲" },
  INFO: { className: "bg-blue-100 text-blue-600", icon: "ℹ" },
  OK: { className: "bg-green-100 text-green-600", icon: "✓" },
};

function pillClasses(active: boolean) {
  return active
    ? "rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-900 text-white"
    : "rounded-lg px-3 py-1.5 text-xs font-medium bg-white ring-1 ring-gray-200";
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const { level, state, cursor } = await searchParams;

  const levelFilter = level && level !== "ALL" ? (level as AlertLevel) : undefined;
  const stateFilter = state === "UNREAD" ? "UNREAD" : "ALL";

  const where = {
    ...(levelFilter ? { level: levelFilter } : {}),
    ...(stateFilter === "UNREAD" ? { read: false } : {}),
  };

  const [alertRows, unreadCount] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { site: true },
    }),
    prisma.alert.count({ where: { read: false } }),
  ]);
  const hasMore = alertRows.length > 100;
  const alerts = alertRows.slice(0, 100);

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {unreadCount === 0 ? "No unread alerts." : `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}.`}
          </p>
        </div>
        <MarkAllReadButton disabled={unreadCount === 0} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => {
            const active = (level ?? "ALL") === l.value;
            const params = new URLSearchParams();
            if (l.value !== "ALL") params.set("level", l.value);
            if (stateFilter !== "ALL") params.set("state", stateFilter);
            const href = params.toString() ? `/alerts?${params.toString()}` : "/alerts";
            return (
              <Link key={l.value} href={href} className={pillClasses(active)}>
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATES.map((s) => {
            const active = stateFilter === s.value;
            const params = new URLSearchParams();
            if (levelFilter) params.set("level", levelFilter);
            if (s.value !== "ALL") params.set("state", s.value);
            const href = params.toString() ? `/alerts?${params.toString()}` : "/alerts";
            return (
              <Link key={s.value} href={href} className={pillClasses(active)}>
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white py-16">
          <div className="text-lg font-semibold">No alerts yet</div>
          <p className="mt-1 text-sm text-gray-500">Alerts are generated when scans complete.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {alerts.map((alert) => {
            const chip = LEVEL_CHIP[alert.level];
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:items-center sm:gap-4 sm:p-5"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${chip.className}`}
                >
                  {chip.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!alert.read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                    <p className={`truncate text-sm ${alert.read ? "font-normal text-gray-700" : "font-semibold text-gray-900"}`}>
                      {alert.message}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                    <Link href={`/sites/${alert.siteId}`} className="hover:underline">
                      {alert.site.name}
                    </Link>
                    <span>·</span>
                    <span>{new Date(alert.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                {!alert.read && <MarkReadButton alertId={alert.id} />}
              </div>
            );
          })}
        </div>
      )}
      {hasMore && alerts.length > 0 && (
        <Link href={`/alerts?${new URLSearchParams({ ...(levelFilter ? { level: levelFilter } : {}), ...(stateFilter !== "ALL" ? { state: stateFilter } : {}), cursor: alerts.at(-1)!.id }).toString()}`} className="mt-4 inline-flex text-sm font-medium text-blue-600 hover:underline">
          Older alerts →
        </Link>
      )}
    </div>
  );
}
