import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Q4a (ENV-01): fail fast on missing/invalid boot-critical env at server
    // startup, before any request can hit a confusing runtime 500. No-op during
    // build/tests (see lib/env.ts).
    const { assertServerEnv } = await import('./lib/env');
    assertServerEnv();
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
