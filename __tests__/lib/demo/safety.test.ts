import {
  assertDemoMutationAllowed,
  DemoCredentialConfigurationError,
  DemoMutationBlockedError,
  evaluateDemoMutationSafety,
  parseDemoUserPasswords,
} from '@/lib/demo/safety';

const isolatedEnv = {
  DEMO_DATA_MUTATIONS_ENABLED: 'true',
  BIZOSTO_ENVIRONMENT: 'staging',
  DEMO_FIREBASE_PROJECT_ID: 'bizosto-staging-isolated',
  FIREBASE_PRODUCTION_PROJECT_ID: 'la-creativo-erp',
};

describe('demo mutation safety', () => {
  it('allows only the exact demo tenant on the explicitly configured isolated project', () => {
    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'bizosto-staging-isolated',
        env: isolatedEnv,
      }),
    ).toEqual({ allowed: true, mode: 'isolated-project' });

    expect(
      evaluateDemoMutationSafety({
        tenantId: 'tenant-a',
        projectId: 'bizosto-staging-isolated',
        env: isolatedEnv,
      }),
    ).toEqual({ allowed: false, reason: 'invalid_tenant' });
  });

  it('blocks missing enablement, production environments, shared production, and mismatches', () => {
    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'bizosto-staging-isolated',
        env: { ...isolatedEnv, DEMO_DATA_MUTATIONS_ENABLED: undefined },
      }),
    ).toEqual({ allowed: false, reason: 'explicit_enable_required' });

    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'bizosto-staging-isolated',
        env: { ...isolatedEnv, VERCEL_ENV: 'production' },
      }),
    ).toEqual({ allowed: false, reason: 'production_environment' });

    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'la-creativo-erp',
        env: { ...isolatedEnv, DEMO_FIREBASE_PROJECT_ID: 'la-creativo-erp' },
      }),
    ).toEqual({ allowed: false, reason: 'production_project' });

    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'unexpected-project',
        env: isolatedEnv,
      }),
    ).toEqual({ allowed: false, reason: 'project_mismatch' });

    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'bizosto-staging-isolated',
        env: { ...isolatedEnv, FIREBASE_PRODUCTION_PROJECT_ID: undefined },
      }),
    ).toEqual({ allowed: false, reason: 'production_project_missing' });
  });

  it('requires both emulators and allows a fully isolated emulator pair', () => {
    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'local-project',
        env: { ...isolatedEnv, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      }),
    ).toEqual({ allowed: false, reason: 'partial_emulator_configuration' });

    expect(
      evaluateDemoMutationSafety({
        tenantId: 'bizosto-demo',
        projectId: 'local-project',
        env: {
          DEMO_DATA_MUTATIONS_ENABLED: 'true',
          BIZOSTO_ENVIRONMENT: 'test',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        },
      }),
    ).toEqual({ allowed: true, mode: 'emulator' });
  });

  it('throws a typed error when a caller attempts a blocked mutation', () => {
    expect(() =>
      assertDemoMutationAllowed({
        tenantId: 'bizosto-demo',
        projectId: 'la-creativo-erp',
        env: {
          DEMO_DATA_MUTATIONS_ENABLED: 'true',
          BIZOSTO_ENVIRONMENT: 'production',
        },
      }),
    ).toThrow(DemoMutationBlockedError);
  });
});

describe('demo credential configuration', () => {
  const emails = ['demo-one@example.com', 'demo-two@example.com'] as const;
  const valid = {
    'demo-one@example.com': 'R7!uQ2#pLm9$wX4z',
    'demo-two@example.com': 'N8@cV3%kTy6&hJ1s',
  };

  it('accepts complete, strong, distinct per-account passwords', () => {
    expect(parseDemoUserPasswords(JSON.stringify(valid), emails)).toEqual(valid);
  });

  it.each([
    undefined,
    'not-json',
    JSON.stringify({ 'demo-one@example.com': valid['demo-one@example.com'] }),
    JSON.stringify({
      'demo-one@example.com': valid['demo-one@example.com'],
      'demo-two@example.com': valid['demo-one@example.com'],
    }),
    JSON.stringify({
      'demo-one@example.com': 'weak',
      'demo-two@example.com': valid['demo-two@example.com'],
    }),
    JSON.stringify({ ...valid, 'unexpected@example.com': 'T9!qW4#pLs7$xK2m' }),
  ])('rejects missing, malformed, weak, or shared credential maps', (raw) => {
    expect(() => parseDemoUserPasswords(raw, emails)).toThrow(DemoCredentialConfigurationError);
  });
});
