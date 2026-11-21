import { prisma } from "@/lib/db";

type QueueMetric = { jobs: number; retries: number; queueAgeMsMax: number };
const metrics: Record<string, QueueMetric> = {};

type ObservableJob = { createdOn?: Date; retryCount?: number };

export function observeJob(queue: string, job: ObservableJob): void {
  const metric = metrics[queue] ?? { jobs: 0, retries: 0, queueAgeMsMax: 0 };
  metric.jobs += 1;
  metric.retries += job.retryCount ?? 0;
  metric.queueAgeMsMax = Math.max(metric.queueAgeMsMax, job.createdOn ? Date.now() - job.createdOn.getTime() : 0);
  metrics[queue] = metric;
}

export async function persistJobMetrics(stallsRecovered = 0): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: "workerMetrics" },
    create: { key: "workerMetrics", value: { at: new Date().toISOString(), queues: metrics, stallsRecovered } },
    update: { value: { at: new Date().toISOString(), queues: metrics, stallsRecovered } },
  });
}
