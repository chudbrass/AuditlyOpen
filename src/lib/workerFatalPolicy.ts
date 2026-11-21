export const FATAL_WORKER_EXIT_CODE = 1;

export function shouldTerminateWorker(event: "uncaughtException" | "unhandledRejection"): true {
  void event;
  return true;
}
