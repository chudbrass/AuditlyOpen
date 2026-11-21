import PgBoss from "pg-boss";
import { ALL_QUEUES } from "@/workers/jobs/queues";
import { queueConnectionLimit } from "@/lib/databaseUrl";

const globalForBoss = globalThis as unknown as {
  boss: PgBoss | undefined;
};

function createBoss() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PgBoss({ connectionString, max: queueConnectionLimit(), application_name: "auditly-queue" });
}

export const DURABLE_JOB_OPTIONS: PgBoss.SendOptions = {
  retryLimit: 5,
  retryDelay: 15,
  retryBackoff: true,
  expireInSeconds: 15 * 60,
  deadLetter: "auditly.dead-letter",
};

export const boss = globalForBoss.boss ?? createBoss();

if (process.env.NODE_ENV !== "production") {
  globalForBoss.boss = boss;
}

let started: Promise<PgBoss> | null = null;

export async function startWorker(): Promise<PgBoss> {
  if (!started) {
    started = boss.start();
  }
  return started;
}

let queuesEnsured: Promise<void> | null = null;

// send() requires the target queue to already exist (pg-boss partitions the job table per
// queue). createQueue() is idempotent (ON CONFLICT DO NOTHING), so it's safe to ensure here
// on every process that enqueues — the worker process also does this at boot.
export function ensureQueues(): Promise<void> {
  if (!queuesEnsured) {
    queuesEnsured = (async () => {
      for (const queue of ALL_QUEUES) {
        await boss.createQueue(queue);
      }
    })();
  }
  return queuesEnsured;
}

/**
 * pg-boss requires `start()` before `send()`/`createQueue()` work. The worker process calls
 * `startWorker()` explicitly at boot; anything enqueuing from the dashboard process (API routes)
 * should call this first since it never otherwise starts the boss connection.
 */
export async function enqueue(
  name: string,
  data: object,
  options?: PgBoss.SendOptions
): Promise<string | null> {
  await startWorker();
  await ensureQueues();
  return boss.send(name, data, { ...DURABLE_JOB_OPTIONS, ...options });
}

// Bounded batch size for boss.insert() — one call inserts every job in a single INSERT, so an
// unbounded array would turn "enqueue 10,000 seed pages" into one enormous statement/parameter
// list instead of many small round-trips. Chunking keeps each insert small and predictable.
const BULK_INSERT_CHUNK_SIZE = 500;

/**
 * Bulk variant of enqueue(): inserts many jobs on the same queue in one round-trip each
 * instead of one round-trip per job. Seeding a large site (thousands of pages) one enqueue()
 * call at a time serializes on network + DB round-trip latency — at 1am, with several large
 * sites seeding concurrently, that serial fan-out was slow and heavy enough on its own to
 * contribute to DB contention severe enough to crash the worker. This is not a drop-in
 * replacement for enqueue(): it has no return value per job and skips per-item error handling,
 * so use it only where a single item's insert failing is acceptable to fail silently as part
 * of the whole chunk (the watchdog's stalled-page sweep exists to catch anything that's lost).
 */
export async function enqueueBulk(
  name: string,
  items: { data: object; options?: PgBoss.SendOptions }[]
): Promise<void> {
  if (items.length === 0) return;
  await startWorker();
  await ensureQueues();

  for (let i = 0; i < items.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = items.slice(i, i + BULK_INSERT_CHUNK_SIZE);
    await boss.insert(
      chunk.map(({ data, options }) => ({
        name,
        data,
        priority: options?.priority,
        singletonKey: options?.singletonKey,
        singletonSeconds: options?.singletonSeconds,
        retryLimit: options?.retryLimit ?? DURABLE_JOB_OPTIONS.retryLimit,
        retryDelay: options?.retryDelay ?? DURABLE_JOB_OPTIONS.retryDelay,
        retryBackoff: options?.retryBackoff ?? DURABLE_JOB_OPTIONS.retryBackoff,
        expireInSeconds: options?.expireInSeconds ?? DURABLE_JOB_OPTIONS.expireInSeconds,
        deadLetter: options?.deadLetter ?? DURABLE_JOB_OPTIONS.deadLetter,
      }))
    );
  }
}
