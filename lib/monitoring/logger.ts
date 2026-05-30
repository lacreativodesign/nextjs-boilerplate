import { adminDb } from "@/lib/firebaseAdmin";
import type { MonitoringSeverity } from "@/lib/monitoring/types";

type LogMetadata = Record<string, unknown>;

type StructuredLogInput = {
  level: MonitoringSeverity;
  message: string;
  module: string;
  tenantId?: string | null;
  userId?: string | null;
  requestId?: string;
  metadata?: LogMetadata;
};

const LOG_COLLECTION = "system_logs";
const RETENTION_DAYS = 30;
const LOG_RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const CLEANUP_SAMPLE_RATE = 0.01;

function safeJsonLog(payload: StructuredLogInput & { timestamp: string }) {
  const encoded = JSON.stringify(payload);
  if (payload.level === "error") {
    console.error(encoded);
    return;
  }

  if (payload.level === "warn") {
    console.warn(encoded);
    return;
  }

  if (payload.level === "debug") {
    // eslint-disable-next-line no-console
    console.debug(encoded);
    return;
  }

  // eslint-disable-next-line no-console
  console.info(encoded);
}

async function maybeRunRetention() {
  if (Math.random() > CLEANUP_SAMPLE_RATE) {
    return;
  }

  const cutoff = new Date(Date.now() - LOG_RETENTION_MS).toISOString();
  const snapshot = await adminDb
    .collection(LOG_COLLECTION)
    .where("timestamp", "<", cutoff)
    .limit(200)
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

export async function writeStructuredLog(input: StructuredLogInput) {
  const timestamp = new Date().toISOString();
  const payload = {
    ...input,
    timestamp,
    metadata: input.metadata || {},
  };

  safeJsonLog(payload);

  try {
    await adminDb.collection(LOG_COLLECTION).add(payload);
    await maybeRunRetention();
  } catch (error) {
    safeJsonLog({
      level: "error",
      message: "monitoring_log_persist_failed",
      module: "monitoring",
      metadata: {
        originalMessage: input.message,
        persistenceError: error instanceof Error ? error.message : String(error),
      },
      timestamp,
    });
  }
}

export const monitoringLogger = {
  debug: (message: string, module: string, metadata?: LogMetadata) =>
    writeStructuredLog({ level: "debug", message, module, metadata }),
  info: (message: string, module: string, metadata?: LogMetadata) =>
    writeStructuredLog({ level: "info", message, module, metadata }),
  warn: (message: string, module: string, metadata?: LogMetadata) =>
    writeStructuredLog({ level: "warn", message, module, metadata }),
  error: (message: string, module: string, metadata?: LogMetadata) =>
    writeStructuredLog({ level: "error", message, module, metadata }),
};
