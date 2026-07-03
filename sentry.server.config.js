import * as Sentry from '@sentry/nextjs';

const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
    }
    return event;
  },
});

// Tag all server errors with environment
Sentry.setTag('runtime', 'server');
Sentry.setTag('app_version', process.env.NEXT_PUBLIC_APP_VERSION || 'unknown');
