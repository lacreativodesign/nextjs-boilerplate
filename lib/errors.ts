export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SUBSCRIPTION_LOCKED'
  | 'SUBSCRIPTION_READ_ONLY'
  | 'TENANT_SUSPENDED'
  | 'INTERNAL_SERVER_ERROR';

export type ErrorResponse = {
  ok: false;
  error: string;
  message: string;
  code: ErrorCode;
  details?: unknown;
  context?: Record<string, unknown>;
  requestId?: string;
  correlationId?: string;
};

export type ErrorResponseOptions = {
  fallbackMessage?: string;
  fallbackCode?: ErrorCode;
  fallbackStatus?: number;
  requestId?: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  exposeMessage?: boolean;
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  expose: boolean;
  details?: unknown;
  retryAfterSeconds?: number;
  context?: Record<string, unknown>;

  constructor({
    message,
    code,
    status,
    expose = true,
    cause,
    details,
    retryAfterSeconds,
    context,
  }: {
    message: string;
    code: ErrorCode;
    status: number;
    expose?: boolean;
    cause?: unknown;
    details?: unknown;
    retryAfterSeconds?: number;
    context?: Record<string, unknown>;
  }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.expose = expose;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
    this.context = context;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function createCorrelationId() {
  return `corr_${crypto.randomUUID()}`;
}

export function resolveErrorResponse(
  error: unknown,
  options: ErrorResponseOptions = {},
): { status: number; body: ErrorResponse; headers: Record<string, string> } {
  const fallbackMessage = options.fallbackMessage || 'Server error';
  const fallbackCode = options.fallbackCode || 'INTERNAL_SERVER_ERROR';
  const fallbackStatus = options.fallbackStatus || 500;
  const requestId = options.requestId;
  const correlationId = options.correlationId || createCorrelationId();
  const context = options.context;

  const headers: Record<string, string> = {
    'x-correlation-id': correlationId,
  };

  if (isAppError(error)) {
    if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds) {
      headers['retry-after'] = String(error.retryAfterSeconds);
    }

    const message = error.expose ? error.message : fallbackMessage;

    return {
      status: error.status,
      headers,
      body: {
        ok: false,
        error: message,
        message,
        code: error.code,
        details: error.details ?? error.cause,
        context: error.context ?? context,
        requestId,
        correlationId,
      },
    };
  }

  if (error instanceof Error && options.exposeMessage) {
    return {
      status: fallbackStatus,
      headers,
      body: {
        ok: false,
        error: error.message || fallbackMessage,
        message: error.message || fallbackMessage,
        code: fallbackCode,
        requestId,
        context,
        correlationId,
      },
    };
  }

  return {
    status: fallbackStatus,
    headers,
    body: {
      ok: false,
      error: fallbackMessage,
      message: fallbackMessage,
      code: fallbackCode,
      requestId,
      context,
      correlationId,
    },
  };
}
