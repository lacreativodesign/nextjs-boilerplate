import * as Sentry from '@sentry/nextjs';

type SentryContext = {
  userId?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  requestId?: string;
  path?: string;
  method?: string;
};

export function setSentryContext(context: SentryContext) {
  if (context.userId) {
    Sentry.setUser({
      id: context.userId,
      email: context.email,
    });
  }

  if (context.tenantId) {
    Sentry.setTag('tenant_id', context.tenantId);
  }

  if (context.role) {
    Sentry.setTag('role', context.role);
  }

  if (context.requestId) {
    Sentry.setTag('request_id', context.requestId);
  }

  if (context.path) {
    Sentry.setTag('path', context.path);
  }

  if (context.method) {
    Sentry.setTag('method', context.method);
  }
}

export function captureApiError(
  error: unknown,
  context: SentryContext & {
    statusCode?: number;
    fingerprint?: string[];
    extra?: Record<string, unknown>;
  },
) {
  Sentry.withScope((scope) => {
    if (context.fingerprint?.length) {
      scope.setFingerprint(context.fingerprint);
    }

    if (context.statusCode) {
      scope.setTag('status_code', String(context.statusCode));
    }

    if (context.tenantId) {
      scope.setTag('tenant_id', context.tenantId);
    }

    if (context.role) {
      scope.setTag('role', context.role);
    }

    if (context.path) {
      scope.setTag('path', context.path);
    }

    if (context.method) {
      scope.setTag('method', context.method);
    }

    if (context.requestId) {
      scope.setTag('request_id', context.requestId);
    }

    if (context.userId) {
      scope.setUser({ id: context.userId, email: context.email });
    }

    if (context.extra) {
      scope.setExtras(context.extra);
    }

    Sentry.captureException(error);
  });
}

export async function trackDbQuery<T>(
  operation: string,
  queryName: string,
  executor: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      op: operation,
      name: queryName,
      attributes: {
        'db.system': 'firestore',
      },
    },
    executor,
  );
}
