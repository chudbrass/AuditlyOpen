import { prisma } from "@/lib/db";

/**
 * Worker liveness, persisted in AppSetting so the dashboard (a separate process) can tell the
 * difference between "scan is queued and about to start" and "no worker is running at all" —
 * without the heartbeat, a scan sits in QUEUED forever and just looks hung.
 */
const HEARTBEAT_KEY = "workerHeartbeat";
export const HEARTBEAT_INTERVAL_MS = 10_000;
// Offline threshold is 3 missed beats — tolerant of tsx-watch restarts and slow event loops.
const OFFLINE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 3;

export async function recordWorkerHeartbeat(): Promise<void> {
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: HEARTBEAT_KEY },
    update: { value: { at: now } },
    create: { key: HEARTBEAT_KEY, value: { at: now } },
  });
}

export interface WorkerStatus {
  online: boolean;
  lastSeenAt: string | null;
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
  const row = await prisma.appSetting.findUnique({ where: { key: HEARTBEAT_KEY } });
  const at =
    row && typeof row.value === "object" && row.value !== null && "at" in row.value
      ? String((row.value as { at: unknown }).at)
      : null;
  if (!at) return { online: false, lastSeenAt: null };
  const age = Date.now() - new Date(at).getTime();
  return { online: age < OFFLINE_AFTER_MS, lastSeenAt: at };
}
