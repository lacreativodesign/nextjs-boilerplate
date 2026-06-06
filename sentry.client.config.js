import * as Sentry from '@sentry/nextjs';

const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1');
const replaysSessionSampleRate = Number(
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? '0',
);
const replaysOnErrorSampleRate = Number(
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? '1.0',
);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate,
  replaysSessionSampleRate,
  replaysOnErrorSampleRate,
  integrations: [
    Sentry.feedbackIntegration({
      autoInject: false,
      colorScheme: 'system',
      showBranding: false,
      isNameRequired: false,
      isEmailRequired: false,
    }),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
    }
    return event;
  },
});

// Capture user context from Firebase Auth if available
if (typeof window !== "undefined") {
  import("@/lib/firebaseClient")
    .then(({ getFirebaseAuth }) => {
      return getFirebaseAuth();
    })
    .then((auth) => {
      auth.onAuthStateChanged((user) => {
        if (user) {
          Sentry.setUser({
            id: user.uid,
            email: user.email || undefined,
          });
          user
            .getIdTokenResult()
            .then((tokenResult) => {
              const tenantId = tokenResult.claims?.tenantId;
              const role = tokenResult.claims?.role;
              if (tenantId) {
                Sentry.setTag("tenant_id", tenantId);
              }
              if (role) {
                Sentry.setTag("user_role", role);
              }
            })
            .catch(() => undefined);
        } else {
          Sentry.setUser(null);
        }
      });
    })
    .catch(() => undefined);
}
