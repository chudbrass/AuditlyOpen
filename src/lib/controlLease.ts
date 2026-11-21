import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const PROCESS_HOLDER_ID = `${process.pid}:${randomUUID()}`;
const locallyRunning = new Set<string>();

/** Acquire or renew a PostgreSQL-backed lease using Prisma's optimistic conditional update. */
export async function acquireControlLease(
  key: string,
  holderId = PROCESS_HOLDER_ID,
  ttlMs = 30_000,
  now = new Date()
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const renewed = await prisma.controlLease.updateMany({
    where: { key, OR: [{ holderId }, { expiresAt: { lte: now } }] },
    data: { holderId, expiresAt },
  });
  if (renewed.count === 1) return true;
  try {
    await prisma.controlLease.create({ data: { key, holderId, expiresAt } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function runAsControlLeader<T>(key: string, action: () => Promise<T>): Promise<T | undefined> {
  if (locallyRunning.has(key) || !(await acquireControlLease(key))) return undefined;
  locallyRunning.add(key);
  const renewal = setInterval(() => {
    acquireControlLease(key).catch((error) => console.error("control lease renewal failed", { key, error }));
  }, 10_000);
  renewal.unref();
  try {
    return await action();
  } finally {
    clearInterval(renewal);
    locallyRunning.delete(key);
  }
}
