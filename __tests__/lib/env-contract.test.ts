import { parseServerEnv, assertServerEnv, serverEnvSchema } from '@/lib/env';

/**
 * Q4a (ENV-01) — typed environment contract guard.
 *
 * lib/env.ts validates the boot-critical SERVER env at startup so missing/invalid
 * values fail fast with a clear message instead of a confusing runtime 500. These
 * tests pin three properties:
 *  1. the boot-required set includes credentials plus explicit deployment/Firebase
 *     isolation metadata (deferred integrations remain optional),
 *  2. shape validation (FIREBASE_ADMIN_KEY must be JSON with project_id; CRON_SECRET
 *     must not be the placeholder), and
 *  3. assertServerEnv throws at runtime but is a no-op during build/tests.
 */

const validKey = JSON.stringify({ project_id: 'prod-project', client_email: 'x@y.z' });

const validEnv = {
  BIZOSTO_ENVIRONMENT: 'production',
  FIREBASE_ADMIN_KEY: validKey,
  FIREBASE_EXPECTED_PROJECT_ID: 'prod-project',
  FIREBASE_PRODUCTION_PROJECT_ID: 'prod-project',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'prod-project',
  RESEND_API_KEY: 're_test_123',
  CRON_SECRET: 'a'.repeat(32),
} as unknown as NodeJS.ProcessEnv;

describe('serverEnvSchema — boot-required set', () => {
  it('requires the boot-critical credentials and isolation metadata', () => {
    const keys = Object.keys(serverEnvSchema.shape);
    expect(keys).toEqual(
      expect.arrayContaining([
        'BIZOSTO_ENVIRONMENT',
        'CRON_SECRET',
        'FIREBASE_ADMIN_KEY',
        'FIREBASE_EXPECTED_PROJECT_ID',
        'FIREBASE_PRODUCTION_PROJECT_ID',
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
        'FIREBASE_EXPECTED_STORAGE_BUCKET',
        'FIREBASE_PRODUCTION_STORAGE_BUCKET',
        'FIREBASE_STORAGE_BUCKET',
        'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
        'RESEND_API_KEY',
        'E2E_EXPECTED_FIREBASE_PROJECT_ID',
        'E2E_ISOLATED_ENVIRONMENT',
        'DAILY_CRON_RUNTIME_BUDGET_MS',
        'DAILY_RETENTION_TENANT_BATCH_SIZE',
        'DAILY_INVOICE_REMINDER_LIMIT',
        'DAILY_ABANDONED_SIGNUP_TENANT_BATCH_SIZE',
        'DAILY_TRIAL_TENANT_BATCH_SIZE',
        'DAILY_BILLING_TENANT_BATCH_SIZE',
        'FIREBASE_STORAGE_EMULATOR_HOST',
      ]),
    );
  });

  it('does NOT require deferred integrations (Stripe etc.)', () => {
    const keys = Object.keys(serverEnvSchema.shape);
    expect(keys).not.toContain('STRIPE_SECRET_KEY');
    expect(keys).not.toContain('STRIPE_WEBHOOK_SECRET');
    expect(keys).not.toContain('NEXT_PUBLIC_APP_URL');
  });
});

describe('parseServerEnv', () => {
  it('accepts a valid environment', () => {
    const result = parseServerEnv(validEnv);
    expect(result.success).toBe(true);
  });

  it('ignores unrelated extra env keys', () => {
    const result = parseServerEnv({
      ...validEnv,
      SOMETHING_ELSE: 'ignored',
    } as unknown as NodeJS.ProcessEnv);
    expect(result.success).toBe(true);
  });

  it('reports every missing var at once', () => {
    const result = parseServerEnv({} as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    const joined = result.errors.join('\n');
    expect(joined).toContain('FIREBASE_ADMIN_KEY');
    expect(joined).toContain('FIREBASE_EXPECTED_PROJECT_ID');
    expect(joined).toContain('FIREBASE_PRODUCTION_PROJECT_ID');
    expect(joined).toContain('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    expect(joined).toContain('RESEND_API_KEY');
    expect(joined).toContain('CRON_SECRET');
  });

  it('rejects a FIREBASE_ADMIN_KEY that is not valid JSON', () => {
    const result = parseServerEnv({
      ...validEnv,
      FIREBASE_ADMIN_KEY: 'not-json',
    } as unknown as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join('\n')).toMatch(/valid JSON/i);
  });

  it('rejects a FIREBASE_ADMIN_KEY JSON missing project_id', () => {
    const result = parseServerEnv({
      ...validEnv,
      FIREBASE_ADMIN_KEY: JSON.stringify({ client_email: 'x@y.z' }),
    } as unknown as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join('\n')).toMatch(/project_id/);
  });

  it('rejects the CRON_SECRET placeholder', () => {
    const result = parseServerEnv({
      ...validEnv,
      CRON_SECRET: 'change-me-in-production',
    } as unknown as NodeJS.ProcessEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join('\n')).toMatch(/placeholder/i);
  });

  it('validates bounded daily runtime and retention batch settings', () => {
    expect(
      parseServerEnv({
        ...validEnv,
        DAILY_CRON_RUNTIME_BUDGET_MS: '270001',
        DAILY_RETENTION_TENANT_BATCH_SIZE: '6',
        DAILY_INVOICE_REMINDER_LIMIT: '251',
      } as unknown as NodeJS.ProcessEnv).success,
    ).toBe(false);
    expect(
      parseServerEnv({
        ...validEnv,
        DAILY_CRON_RUNTIME_BUDGET_MS: '270000',
        DAILY_RETENTION_TENANT_BATCH_SIZE: '1',
        DAILY_INVOICE_REMINDER_LIMIT: '100',
      } as unknown as NodeJS.ProcessEnv).success,
    ).toBe(true);
  });
});

describe('assertServerEnv — fail-fast vs build/test safety', () => {
  it('throws at runtime when required vars are missing', () => {
    expect(() =>
      assertServerEnv({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid server environment/);
  });

  it('does not throw when the environment is valid', () => {
    expect(() =>
      assertServerEnv({ ...validEnv, NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('is a no-op during the production build phase even if vars are missing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertServerEnv({
        NODE_ENV: 'production',
        NEXT_PHASE: 'phase-production-build',
      } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op under the test runner even if vars are missing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertServerEnv({ NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
    warn.mockRestore();
  });
});
