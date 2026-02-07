export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SUBSCRIPTION_LOCKED"
  | "SUBSCRIPTION_READ_ONLY"
  | "TENANT_SUSPENDED"
  | "INTERNAL_SERVER_ERROR";

export type ErrorResponse = {
  ok: false;
  error: string;
  code: ErrorCode;
  requestId?: string;
};

export type ErrorResponseOptions = {
  fallbackMessage?: string;
  fallbackCode?: ErrorCode;
  fallbackStatus?: number;
  requestId?: string;
  exposeMessage?: boolean;
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  expose: boolean;
  constructor({
    message,
    code,
    status,
    expose = true,
    cause,
  }: {
    message: string;
    code: ErrorCode;
    status: number;
    expose?: boolean;
    cause?: unknown;
  }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.expose = expose;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function resolveErrorResponse(
  error: unknown,
  options: ErrorResponseOptions = {}
): { status: number; body: ErrorResponse } {
  const fallbackMessage = options.fallbackMessage || "Server error";
  const fallbackCode = options.fallbackCode || "INTERNAL_SERVER_ERROR";
  const fallbackStatus = options.fallbackStatus || 500;
  const requestId = options.requestId;

  if (isAppError(error)) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.expose ? error.message : fallbackMessage,
        code: error.code,
        requestId,
      },
    };
  }

  if (error instanceof Error && options.exposeMessage) {
    return {
      status: fallbackStatus,
      body: {
        ok: false,
        error: error.message || fallbackMessage,
        code: fallbackCode,
        requestId,
      },
    };
  }

  return {
    status: fallbackStatus,
    body: {
      ok: false,
      error: fallbackMessage,
      code: fallbackCode,
      requestId,
    },
  };
}
