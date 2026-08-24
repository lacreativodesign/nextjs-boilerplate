import { z } from 'zod';
import {
  inspectFirebaseProjectIsolation,
  isNonRuntimePhase,
} from '@/lib/config/firebase-environment';

/**
 * Q4a — typed environment contract (ENV-01).
 *
 * Purpose: turn missing/invalid boot-critical env vars into ONE clear, fail-fast
 * error at server startup instead of confusing runtime 500s deep inside a request
 * (e.g. the Firebase Admin throwing-proxy in lib/firebaseAdmin.ts firing on the
 * first Firestore call).
 *
 * Scope is deliberately narrow. It validates boot-critical credentials plus the
 * three project-ID values that prove Firebase Admin, the browser SDK, and the
 * deployment environment all target the intended isolated project.
 *
 * It intentionally does NOT require the deferred, intentionally-empty
 * integrations (Stripe, Stripe Connect, Slack, Twilio, DocuSign, Calendly, Xero,
 * QuickBooks, Mailchimp, SendGrid, SES, AWS, Google OAuth). Requiring those would
 * crash the pre-launch app. NEXT_PUBLIC_* vars are inlined at build time and are
 * checked by the build itself, not here.
 */

const CRON_PLACEHOLDER = 'change-me-in-production';

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalNonEmptyString = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());

const optionalSecretJsonObject = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .min(1)
    .superRefine((value, ctx) => {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        if (
          !Object.values(parsed as Record<string, unknown>).every(
            (item) => typeof item === 'string' && item.length > 0,
          )
        ) {
          throw new Error('invalid values');
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'must be a JSON object whose values are non-empty strings.',
        });
      }
    })
    .optional(),
);

const optionalIntegerString = (minimum: number, maximum: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d+$/, 'must be an integer.')
      .refine((value) => Number(value) >= minimum && Number(value) <= maximum, {
        message: `must be between ${minimum} and ${maximum}.`,
      })
      .optional(),
  );

/**
 * FIREBASE_ADMIN_KEY must be a JSON service-account object with a non-empty
 * project_id — the exact shape lib/firebaseAdmin.ts needs to initialise.
 */
const firebaseAdminKey = z.preprocess(
  blankToUndefined,
  z
    .string()
    .min(1)
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
    })
    .optional(),
);

export const serverEnvSchema = z.object({
  BIZOSTO_ENVIRONMENT: z.enum(['production', 'staging', 'development', 'test']),
  FIREBASE_ADMIN_KEY: firebaseAdminKey,
  FIREBASE_EXPECTED_PROJECT_ID: z
    .string({
      required_error:
        'FIREBASE_EXPECTED_PROJECT_ID is required (the Firebase project for this deployment).',
    })
    .trim()
    .min(1, 'FIREBASE_EXPECTED_PROJECT_ID must not be empty.'),
  FIREBASE_PRODUCTION_PROJECT_ID: z
    .string({
      required_error:
        'FIREBASE_PRODUCTION_PROJECT_ID is required (the production isolation boundary).',
    })
    .trim()
    .min(1, 'FIREBASE_PRODUCTION_PROJECT_ID must not be empty.'),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z
    .string({
      required_error: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID is required (Firebase client project ID).',
    })
    .trim()
    .min(1, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID must not be empty.'),
  FIREBASE_EXPECTED_STORAGE_BUCKET: optionalNonEmptyString,
  FIREBASE_PRODUCTION_STORAGE_BUCKET: optionalNonEmptyString,
  FIREBASE_STORAGE_BUCKET: optionalNonEmptyString,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: optionalNonEmptyString,
  RESEND_API_KEY: z
    .string({ required_error: 'RESEND_API_KEY is required (transactional email via Resend).' })
    .min(1, 'RESEND_API_KEY is required (transactional email via Resend).'),
  CRON_SECRET: z
    .string({ required_error: 'CRON_SECRET is required (authenticates cron routes).' })
    .min(32, 'CRON_SECRET must contain at least 32 characters.')
    .refine((value) => !/\s/.test(value), {
      message: 'CRON_SECRET must not contain whitespace.',
    })
    .refine((v) => v !== CRON_PLACEHOLDER, {
      message: `CRON_SECRET must not be the placeholder "${CRON_PLACEHOLDER}".`,
    }),
  DEMO_DATA_MUTATIONS_ENABLED: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()),
  DEMO_FIREBASE_PROJECT_ID: optionalNonEmptyString,
  DEMO_USER_PASSWORDS_JSON: optionalSecretJsonObject,
  E2E_DEMO_PASSWORDS_JSON: optionalSecretJsonObject,
  E2E_EXPECTED_FIREBASE_PROJECT_ID: optionalNonEmptyString,
  E2E_ISOLATED_ENVIRONMENT: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()),
  FIRESTORE_EMULATOR_HOST: optionalNonEmptyString,
  FIREBASE_AUTH_EMULATOR_HOST: optionalNonEmptyString,
  FIREBASE_STORAGE_EMULATOR_HOST: optionalNonEmptyString,
  DAILY_CRON_RUNTIME_BUDGET_MS: optionalIntegerString(60_000, 270_000),
  DAILY_RETENTION_TENANT_BATCH_SIZE: optionalIntegerString(1, 5),
  DAILY_INVOICE_REMINDER_LIMIT: optionalIntegerString(1, 250),
  DAILY_ABANDONED_SIGNUP_TENANT_BATCH_SIZE: optionalIntegerString(1, 25),
  DAILY_TRIAL_TENANT_BATCH_SIZE: optionalIntegerString(1, 50),
  DAILY_BILLING_TENANT_BATCH_SIZE: optionalIntegerString(1, 100),
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
  const errors = result.success
    ? []
    : result.error.issues.map((issue) => {
        const key = issue.path.join('.') || '(env)';
        return `${key}: ${issue.message}`;
      });

  const isolation = inspectFirebaseProjectIsolation(env);
  if (!isolation.safe) {
    errors.push(
      ...isolation.errors.map((code) =>
        code === 'ADMIN_PROJECT_MISSING'
          ? 'FIREBASE_ADMIN_KEY: required outside a complete demo-* Firebase emulator configuration.'
          : `FIREBASE_PROJECT_ISOLATION: ${code}`,
      ),
    );
  }

  if (errors.length > 0 || !result.success) {
    return { success: false, errors: [...new Set(errors)] };
  }

  return { success: true, data: result.data };
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
