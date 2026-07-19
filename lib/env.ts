import { z } from 'zod';

/**
 * Q4a — typed environment contract (ENV-01).
 *
 * Purpose: turn missing/invalid boot-critical env vars into ONE clear, fail-fast
 * error at server startup instead of confusing runtime 500s deep inside a request
 * (e.g. the Firebase Admin throwing-proxy in lib/firebaseAdmin.ts firing on the
 * first Firestore call).
 *
 * Scope is deliberately narrow. It validates ONLY server-side variables that are
 *   (a) actually read by the code,
 *   (b) already provisioned in production, and
 *   (c) boot-critical — their absence breaks core auth / email / cron auth.
 *
 * It intentionally does NOT require the deferred, intentionally-empty
 * integrations (Stripe, Stripe Connect, Slack, Twilio, DocuSign, Calendly, Xero,
 * QuickBooks, Mailchimp, SendGrid, SES, AWS, Google OAuth). Requiring those would
 * crash the pre-launch app. NEXT_PUBLIC_* vars are inlined at build time and are
 * checked by the build itself, not here.
 */

const CRON_PLACEHOLDER = 'change-me-in-production';

/**
 * FIREBASE_ADMIN_KEY must be a JSON service-account object with a non-empty
 * project_id — the exact shape lib/firebaseAdmin.ts needs to initialise.
 */
const firebaseAdminKey = z
  .string({ required_error: 'FIREBASE_ADMIN_KEY is required (Firebase service-account JSON).' })
  .min(1, 'FIREBASE_ADMIN_KEY is required (Firebase service-account JSON).')
  .superRefine((value, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FIREBASE_ADMIN_KEY must be valid JSON (the service-account file contents).',
      });
      return;
    }
    const projectId = (parsed as { project_id?: unknown } | null)?.project_id;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FIREBASE_ADMIN_KEY JSON must include a non-empty "project_id".',
      });
    }
  });

export const serverEnvSchema = z.object({
  FIREBASE_ADMIN_KEY: firebaseAdminKey,
  RESEND_API_KEY: z
    .string({ required_error: 'RESEND_API_KEY is required (transactional email via Resend).' })
    .min(1, 'RESEND_API_KEY is required (transactional email via Resend).'),
  CRON_SECRET: z
    .string({ required_error: 'CRON_SECRET is required (authenticates cron routes).' })
    .min(1, 'CRON_SECRET is required (authenticates cron routes).')
    .refine((v) => v !== CRON_PLACEHOLDER, {
      message: `CRON_SECRET must not be the placeholder "${CRON_PLACEHOLDER}".`,
    }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvParseResult =
  { success: true; data: ServerEnv } | { success: false; errors: string[] };

/**
 * Pure, side-effect-free validation of the boot-critical server env.
 * Returns structured errors; never throws. Safe to unit-test with any input.
 */
export function parseServerEnv(env: NodeJS.ProcessEnv = process.env): EnvParseResult {
  const result = serverEnvSchema.safeParse(env);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || '(env)';
    return `${key}: ${issue.message}`;
  });
  return { success: false, errors };
}

/**
 * True during `next build` (Next sets NEXT_PHASE=phase-production-build) or under
 * the jest test runner. In both phases the boot-critical secrets are legitimately
 * absent, so we must NOT fail-fast: the app is intentionally buildable with stub
 * credentials (see lib/firebaseAdmin.ts).
 */
function isNonRuntimePhase(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PHASE === 'phase-production-build' || env.NODE_ENV === 'test';
}

/**
 * Fail-fast entry point. Call ONCE at server startup (instrumentation.register()).
 * - At real runtime: throws a single aggregated error listing every problem.
 * - During build / tests: logs a warning and returns without throwing.
 */
export function assertServerEnv(env: NodeJS.ProcessEnv = process.env): void {
  const result = parseServerEnv(env);
  if (result.success) {
    return;
  }

  const message =
    'Invalid server environment. Fix these variables (see .env.example):\n' +
    result.errors.map((e) => `  - ${e}`).join('\n');

  if (isNonRuntimePhase(env)) {
    console.warn(`[env] ${message}`);
    return;
  }

  throw new Error(message);
}
