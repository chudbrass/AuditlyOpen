function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function prismaConnectionUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const role = process.env.AUDITLY_PROCESS_ROLE === "worker" ? "WORKER" : "APP";
  const limit = positiveInt(process.env[`AUDITLY_DB_${role}_CONNECTION_LIMIT`], role === "WORKER" ? 12 : 8);
  const timeout = positiveInt(process.env.AUDITLY_DB_POOL_TIMEOUT_SECONDS, 10);
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", String(limit));
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", String(timeout));
  return url.toString();
}

export function queueConnectionLimit(): number {
  return positiveInt(process.env.AUDITLY_DB_QUEUE_CONNECTION_LIMIT, 5);
}
