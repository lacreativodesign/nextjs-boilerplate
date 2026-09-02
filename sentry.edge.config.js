import * as Sentry from '@sentry/nextjs';

const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate,
  // SOC2 F-12: parity with the server config, which already sets this. Middleware
  // runs on the edge runtime and sees every request, so the default-PII posture
  // matters most here.
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

Sentry.setTag('runtime', 'edge');
