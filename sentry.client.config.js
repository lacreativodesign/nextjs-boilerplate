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
  // SOC2 F-12: matches the server config. Without it the browser SDK attaches
  // request PII to events by default, which would defeat the beforeSend scrubbing.
  sendDefaultPii: false,
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
if (typeof window !== 'undefined') {
  import('@/lib/firebaseClient')
    .then(({ getFirebaseAuth }) => {
      return getFirebaseAuth();
    })
    .then((auth) => {
      auth.onAuthStateChanged((user) => {
        if (user) {
          // SOC2 F-12: uid only. Sending `email` shipped identifiable personal data to
          // Sentry, contradicting `sendDefaultPii: false` and the beforeSend scrubbing,
          // and putting PII into a processor that is not covered by a DPA or named in
          // any subprocessor register. A uid is pseudonymous and still lets an engineer
          // correlate an error to a session through Firebase.
          Sentry.setUser({
            id: user.uid,
          });
          user
            .getIdTokenResult()
            .then((tokenResult) => {
              const tenantId = tokenResult.claims?.tenantId;
              const role = tokenResult.claims?.role;
              if (tenantId) {
                Sentry.setTag('tenant_id', tenantId);
              }
              if (role) {
                Sentry.setTag('user_role', role);
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
