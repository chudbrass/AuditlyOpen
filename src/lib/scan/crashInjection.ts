/** Test-only deterministic crash points for exercising durable transition recovery. */
export function injectCrash(point: string): void {
  if (process.env.NODE_ENV !== "test" && process.env.AUDITLY_ENABLE_CRASH_INJECTION !== "1") return;
  if (process.env.AUDITLY_CRASH_AT === point) {
    throw new Error(`Injected crash at ${point}`);
  }
}
