import { AppError, isAppError } from "@/lib/errors";

export type LogContext = {
  requestId?: string;
  route?: string;
  tenantId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export function serializeError(error: unknown) {
  if (isAppError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
      cause: error.cause,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }

  return { message: String(error) };
}

export function logError(error: unknown, context: LogContext = {}) {
  const payload = {
    level: "error",
    error: serializeError(error),
    context,
    timestamp: new Date().toISOString(),
  };
  console.error(payload);
}

export function logInfo(message: string, context: LogContext = {}) {
  const payload = {
    level: "info",
    message,
    context,
    timestamp: new Date().toISOString(),
  };
  console.info(payload);
}
