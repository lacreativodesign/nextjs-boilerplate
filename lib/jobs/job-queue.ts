import { adminDb } from "@/lib/firebaseAdmin";
import { runRetentionCleanup, runRetentionCleanupAcrossTenants } from "@/lib/compliance/data-retention";
import { runQuickBooksSync } from "@/lib/integrations/quickbooks";
import { runXeroSync } from "@/lib/integrations/xero";

const JOB_COLLECTION = "backgroundJobs";
const READY_QUEUE_KEY = "jobs:ready";
const SCHEDULED_QUEUE_KEY = "jobs:scheduled";
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_SECONDS = 30;
const MAX_RETRY_DELAY_SECONDS = 60 * 15;

export type JobType = "email" | "report_generation" | "data_sync" | "file_processing" | "cleanup";
export type JobStatus = "pending" | "processing" | "completed" | "failed";

type EmailJobPayload = {
  tenantId: string;
  triggeredBy?: string;
  subject: string;
  body: string;
  recipients: string[];
  metadata?: Record<string, unknown>;
};

type ReportJobPayload = {
  tenantId: string;
  reportName: string;
  fromDate?: string;
  toDate?: string;
  triggeredBy?: string;
  filters?: Record<string, string | number | boolean | null>;
};

type DataSyncPayload = {
  tenantId: string;
  provider: "quickbooks" | "xero";
  triggeredBy?: string;
  forceInitial?: boolean;
};

type FileProcessingPayload = {
  tenantId: string;
  triggeredBy?: string;
  filePath: string;
  operation: "extract_text" | "generate_preview" | "virus_scan";
  metadata?: Record<string, unknown>;
};

type CleanupPayload = {
  tenantId?: string;
  triggeredBy?: string;
  scope: "tenant" | "global";
};

export type JobPayloadByType = {
  email: EmailJobPayload;
  report_generation: ReportJobPayload;
  data_sync: DataSyncPayload;
  file_processing: FileProcessingPayload;
  cleanup: CleanupPayload;
};

type EnqueueJobInput<T extends JobType> = {
  type: T;
  payload: JobPayloadByType[T];
  maxAttempts?: number;
  runAt?: Date;
};

export type JobRecord = {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: JobPayloadByType[JobType];
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type RedisLike = {
  lpush: (key: string, ...values: string[]) => Promise<number>;
  rpop: (key: string) => Promise<string | null>;
  zadd: (key: string, value: { score: number; member: string } | Array<{ score: number; member: string }>) => Promise<number>;
  zrangebyscore: (key: string, min: number, max: number) => Promise<string[]>;
  zrem: (key: string, ...members: string[]) => Promise<number>;
};

let redisPromise: Promise<RedisLike | null> | null = null;

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function getRedisClient() {
  if (!redisPromise) {
    redisPromise = (async () => {
      const config = getUpstashConfig();
      if (!config) return null;
      const mod = (await import("@upstash/redis")) as unknown as {
        Redis: new (args: { url: string; token: string }) => RedisLike;
      };
      return new mod.Redis(config);
    })();
  }
  return redisPromise;
}

function nowIso() {
  return new Date().toISOString();
}

function calculateRetryDelaySeconds(attempts: number) {
  return Math.min(BASE_RETRY_DELAY_SECONDS * 2 ** Math.max(attempts - 1, 0), MAX_RETRY_DELAY_SECONDS);
}

export async function enqueueJob<T extends JobType>(input: EnqueueJobInput<T>) {
  const redis = await getRedisClient();
  if (!redis) {
    throw new Error("Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }

  const createdAt = nowIso();
  const payload = input.payload as JobPayloadByType[JobType];
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? MAX_RETRY_ATTEMPTS, 10));

  const jobRef = adminDb.collection(JOB_COLLECTION).doc();
  const job: Omit<JobRecord, "id"> = {
    type: input.type,
    status: "pending",
    payload,
    attempts: 0,
    maxAttempts,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    scheduledAt: input.runAt ? input.runAt.toISOString() : createdAt,
    startedAt: null,
    completedAt: null,
  };

  await jobRef.set(job);

  const scheduledAtMs = input.runAt?.getTime() ?? Date.now();
  if (scheduledAtMs <= Date.now()) {
    await redis.lpush(READY_QUEUE_KEY, jobRef.id);
  } else {
    await redis.zadd(SCHEDULED_QUEUE_KEY, { score: scheduledAtMs, member: jobRef.id });
  }

  return jobRef.id;
}

async function promoteScheduledJobs() {
  const redis = await getRedisClient();
  if (!redis) return 0;

  const due = await redis.zrangebyscore(SCHEDULED_QUEUE_KEY, 0, Date.now());
  if (!due.length) return 0;

  await redis.lpush(READY_QUEUE_KEY, ...due);
  await redis.zrem(SCHEDULED_QUEUE_KEY, ...due);
  return due.length;
}

async function popNextJobId() {
  const redis = await getRedisClient();
  if (!redis) throw new Error("Upstash Redis is not configured.");
  return redis.rpop(READY_QUEUE_KEY);
}

async function withJobStatus(jobId: string, updater: (job: JobRecord) => Promise<void>) {
  const ref = adminDb.collection(JOB_COLLECTION).doc(jobId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Job not found.");
  const data = snapshot.data() as Omit<JobRecord, "id">;
  await updater({ id: snapshot.id, ...data });
}

async function processEmailJob(job: JobRecord) {
  const payload = job.payload as EmailJobPayload;
  if (!payload.tenantId || !payload.subject || !payload.body || !payload.recipients?.length) {
    throw new Error("Invalid email job payload.");
  }

  const writes = payload.recipients.map((recipient) =>
    adminDb.collection("email_queue").add({
      tenantId: payload.tenantId,
      to: recipient,
      subject: payload.subject,
      body: payload.body,
      status: "queued",
      createdAt: nowIso(),
      triggeredBy: payload.triggeredBy || "system:jobs",
      metadata: payload.metadata || {},
    }),
  );

  await Promise.all(writes);
}

async function processReportJob(job: JobRecord) {
  const payload = job.payload as ReportJobPayload;
  if (!payload.tenantId || !payload.reportName) {
    throw new Error("Invalid report generation payload.");
  }

  await adminDb.collection("reportJobs").add({
    tenantId: payload.tenantId,
    reportName: payload.reportName,
    status: "completed",
    generatedAt: nowIso(),
    range: {
      fromDate: payload.fromDate || null,
      toDate: payload.toDate || null,
    },
    triggeredBy: payload.triggeredBy || "system:jobs",
    filters: payload.filters || {},
  });
}

async function processDataSyncJob(job: JobRecord) {
  const payload = job.payload as DataSyncPayload;
  if (!payload.tenantId || !payload.provider) {
    throw new Error("Invalid data sync payload.");
  }

  if (payload.provider === "quickbooks") {
    await runQuickBooksSync({
      tenantId: payload.tenantId,
      userUid: payload.triggeredBy || "system:jobs",
      forceInitial: payload.forceInitial,
    });
    return;
  }

  await runXeroSync({
    tenantId: payload.tenantId,
    userUid: payload.triggeredBy || "system:jobs",
    forceInitial: payload.forceInitial,
  });
}

async function processFileJob(job: JobRecord) {
  const payload = job.payload as FileProcessingPayload;
  if (!payload.tenantId || !payload.filePath || !payload.operation) {
    throw new Error("Invalid file processing payload.");
  }

  await adminDb.collection("fileProcessingJobs").add({
    tenantId: payload.tenantId,
    filePath: payload.filePath,
    operation: payload.operation,
    status: "processed",
    processedAt: nowIso(),
    triggeredBy: payload.triggeredBy || "system:jobs",
    metadata: payload.metadata || {},
  });
}

async function processCleanupJob(job: JobRecord) {
  const payload = job.payload as CleanupPayload;
  if (!payload.scope) {
    throw new Error("Invalid cleanup payload.");
  }

  if (payload.scope === "tenant") {
    if (!payload.tenantId) throw new Error("Cleanup job requires tenantId for tenant scope.");
    await runRetentionCleanup(payload.tenantId);
    return;
  }

  await runRetentionCleanupAcrossTenants();
}

async function processJob(job: JobRecord) {
  switch (job.type) {
    case "email":
      await processEmailJob(job);
      return;
    case "report_generation":
      await processReportJob(job);
      return;
    case "data_sync":
      await processDataSyncJob(job);
      return;
    case "file_processing":
      await processFileJob(job);
      return;
    case "cleanup":
      await processCleanupJob(job);
      return;
    default:
      throw new Error(`Unsupported job type: ${(job as { type: string }).type}`);
  }
}

async function markJobForRetry(job: JobRecord, error: string) {
  const redis = await getRedisClient();
  if (!redis) throw new Error("Upstash Redis is not configured.");

  const nextAttempts = job.attempts + 1;
  const exhausted = nextAttempts >= job.maxAttempts;

  if (exhausted) {
    await adminDb.collection(JOB_COLLECTION).doc(job.id).update({
      status: "failed",
      attempts: nextAttempts,
      lastError: error,
      updatedAt: nowIso(),
      completedAt: nowIso(),
    });
    return;
  }

  const delaySeconds = calculateRetryDelaySeconds(nextAttempts);
  const retryAt = Date.now() + delaySeconds * 1000;

  await adminDb.collection(JOB_COLLECTION).doc(job.id).update({
    status: "pending",
    attempts: nextAttempts,
    lastError: error,
    updatedAt: nowIso(),
    scheduledAt: new Date(retryAt).toISOString(),
  });

  await redis.zadd(SCHEDULED_QUEUE_KEY, { score: retryAt, member: job.id });
}

export async function processDueJobs(batchSize = 20) {
  const promoted = await promoteScheduledJobs();
  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < batchSize; i += 1) {
    const jobId = await popNextJobId();
    if (!jobId) break;

    const ref = adminDb.collection(JOB_COLLECTION).doc(jobId);
    const snapshot = await ref.get();
    if (!snapshot.exists) continue;

    const job = { id: snapshot.id, ...(snapshot.data() as Omit<JobRecord, "id">) };
    if (job.status === "completed") continue;

    await ref.update({
      status: "processing",
      startedAt: nowIso(),
      updatedAt: nowIso(),
    });

    try {
      await processJob(job);
      await ref.update({
        status: "completed",
        attempts: job.attempts + 1,
        completedAt: nowIso(),
        updatedAt: nowIso(),
        lastError: null,
      });
      results.push({ jobId, ok: true });
    } catch (error: any) {
      const message = error?.message || "Unknown job failure";
      await markJobForRetry(job, message);
      results.push({ jobId, ok: false, error: message });
    }
  }

  return {
    promoted,
    processed: results.length,
    successCount: results.filter((r) => r.ok).length,
    failedCount: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function retryFailedJob(jobId: string) {
  const redis = await getRedisClient();
  if (!redis) throw new Error("Upstash Redis is not configured.");

  await withJobStatus(jobId, async (job) => {
    if (job.status !== "failed") {
      throw new Error("Only failed jobs can be retried.");
    }

    await adminDb.collection(JOB_COLLECTION).doc(jobId).update({
      status: "pending",
      lastError: null,
      completedAt: null,
      updatedAt: nowIso(),
      scheduledAt: nowIso(),
    });

    await redis.lpush(READY_QUEUE_KEY, jobId);
  });
}

export async function listJobs(params: { status?: JobStatus; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 500));
  let query = adminDb.collection(JOB_COLLECTION).orderBy("createdAt", "desc").limit(limit);
  if (params.status) {
    query = query.where("status", "==", params.status).orderBy("createdAt", "desc").limit(limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<JobRecord, "id">) }));
}

export async function getJobMetrics() {
  const [pending, processing, completed, failed] = await Promise.all([
    adminDb.collection(JOB_COLLECTION).where("status", "==", "pending").count().get(),
    adminDb.collection(JOB_COLLECTION).where("status", "==", "processing").count().get(),
    adminDb.collection(JOB_COLLECTION).where("status", "==", "completed").count().get(),
    adminDb.collection(JOB_COLLECTION).where("status", "==", "failed").count().get(),
  ]);

  return {
    pending: pending.data().count,
    processing: processing.data().count,
    completed: completed.data().count,
    failed: failed.data().count,
  };
}
