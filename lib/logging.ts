import { AppError, isAppError } from '@/lib/errors';

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

function emit(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: LogContext = {},
  error?: unknown,
) {
  const payload = {
    level,
    message,
    context,
    error: error ? serializeError(error) : undefined,
    timestamp: new Date().toISOString(),
  };

  const logLine = JSON.stringify(payload);
  if (level === 'error') {
    console.error(logLine);
    return;
  }
  if (level === 'warn') {
    console.warn(logLine);
    return;
  }
  if (level === 'debug') {
    console.debug(logLine);
    return;
  }
  console.info(logLine);
}

export function logDebug(message: string, context: LogContext = {}) {
  emit('debug', message, context);
}

export function logInfo(message: string, context: LogContext = {}) {
  emit('info', message, context);
}

export function logWarn(message: string, context: LogContext = {}) {
  emit('warn', message, context);
}

export function logError(error: unknown, context: LogContext = {}) {
  emit('error', 'application_error', context, error);
}
