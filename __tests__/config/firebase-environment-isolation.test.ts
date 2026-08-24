import {
  assertFirebaseProjectIsolation,
  inspectFirebaseProjectIsolation,
  parseServiceAccountProjectId,
} from '@/lib/config/firebase-environment';
import { getSafeConfigurationDiagnostics } from '@/lib/config/diagnostics';

const serviceAccount = (projectId: string) =>
  JSON.stringify({
    project_id: projectId,
    client_email: 'server@example.invalid',
    private_key: 'must-never-appear-in-diagnostics',
  });

const production = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  BIZOSTO_ENVIRONMENT: 'production',
  FIREBASE_EXPECTED_PROJECT_ID: 'prod-project',
  FIREBASE_PRODUCTION_PROJECT_ID: 'prod-project',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'prod-project',
  FIREBASE_ADMIN_KEY: serviceAccount('prod-project'),
} as unknown as NodeJS.ProcessEnv;

describe('Firebase project isolation', () => {
  it('accepts an aligned production deployment', () => {
    expect(inspectFirebaseProjectIsolation(production)).toMatchObject({
      deploymentEnvironment: 'production',
      safe: true,
      adminMatchesExpected: true,
      publicMatchesExpected: true,
    });
  });

  it('fails closed when Admin and public projects differ', () => {
    const result = inspectFirebaseProjectIsolation({
      ...production,
      FIREBASE_ADMIN_KEY: serviceAccount('other-project'),
    } as NodeJS.ProcessEnv);
    expect(result.safe).toBe(false);
    expect(result.errors).toContain('ADMIN_EXPECTED_MISMATCH');
  });

  it('rejects preview when it targets the production project', () => {
    const preview = {
      ...production,
      VERCEL_ENV: 'preview',
      BIZOSTO_ENVIRONMENT: 'staging',
    } as NodeJS.ProcessEnv;
    expect(() => assertFirebaseProjectIsolation(preview)).toThrow(
      /PREVIEW_USES_PRODUCTION_PROJECT/,
    );
  });

  it('rejects preview when the production boundary is unknown', () => {
    const result = inspectFirebaseProjectIsolation({
      ...production,
      VERCEL_ENV: 'preview',
      BIZOSTO_ENVIRONMENT: 'staging',
      FIREBASE_EXPECTED_PROJECT_ID: 'staging-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'staging-project',
      FIREBASE_ADMIN_KEY: serviceAccount('staging-project'),
      FIREBASE_PRODUCTION_PROJECT_ID: '',
    } as NodeJS.ProcessEnv);
    expect(result.safe).toBe(false);
    expect(result.errors).toContain('PRODUCTION_PROJECT_MISSING');
  });

  it('accepts preview only when Admin and public config share an isolated project', () => {
    const preview = {
      ...production,
      VERCEL_ENV: 'preview',
      BIZOSTO_ENVIRONMENT: 'staging',
      FIREBASE_EXPECTED_PROJECT_ID: 'staging-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'staging-project',
      FIREBASE_ADMIN_KEY: serviceAccount('staging-project'),
    } as NodeJS.ProcessEnv;
    expect(inspectFirebaseProjectIsolation(preview)).toMatchObject({
      safe: true,
      previewSeparatedFromProduction: true,
    });
  });

  it('fails a preview build before production Firebase config can be inlined', () => {
    expect(() =>
      assertFirebaseProjectIsolation({
        ...production,
        NEXT_PHASE: 'phase-production-build',
        VERCEL_ENV: 'preview',
        BIZOSTO_ENVIRONMENT: 'staging',
      } as NodeJS.ProcessEnv),
    ).toThrow(/PREVIEW_USES_PRODUCTION_PROJECT/);
  });

  it('rejects an environment label that disagrees with the Vercel target', () => {
    const result = inspectFirebaseProjectIsolation({
      ...production,
      VERCEL_ENV: 'preview',
      BIZOSTO_ENVIRONMENT: 'production',
      FIREBASE_EXPECTED_PROJECT_ID: 'staging-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'staging-project',
      FIREBASE_ADMIN_KEY: serviceAccount('staging-project'),
    } as NodeJS.ProcessEnv);
    expect(result.errors).toContain('BIZOSTO_ENVIRONMENT_MISMATCH');
  });

  it('fails closed when preview Storage points at the production bucket', () => {
    const result = inspectFirebaseProjectIsolation({
      ...production,
      VERCEL_ENV: 'preview',
      BIZOSTO_ENVIRONMENT: 'staging',
      FIREBASE_EXPECTED_PROJECT_ID: 'staging-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'staging-project',
      FIREBASE_ADMIN_KEY: serviceAccount('staging-project'),
      FIREBASE_EXPECTED_STORAGE_BUCKET: 'prod-project.appspot.com',
      FIREBASE_PRODUCTION_STORAGE_BUCKET: 'prod-project.appspot.com',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'prod-project.appspot.com',
    } as NodeJS.ProcessEnv);
    expect(result.errors).toContain('PREVIEW_USES_PRODUCTION_STORAGE_BUCKET');
  });

  it('accepts an isolated preview Storage bucket and never returns its name', () => {
    const preview = {
      ...production,
      VERCEL_ENV: 'preview',
      BIZOSTO_ENVIRONMENT: 'staging',
      FIREBASE_EXPECTED_PROJECT_ID: 'staging-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'staging-project',
      FIREBASE_ADMIN_KEY: serviceAccount('staging-project'),
      FIREBASE_EXPECTED_STORAGE_BUCKET: 'staging-project.appspot.com',
      FIREBASE_PRODUCTION_STORAGE_BUCKET: 'prod-project.appspot.com',
      FIREBASE_STORAGE_BUCKET: 'staging-project.appspot.com',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'staging-project.appspot.com',
    } as NodeJS.ProcessEnv;
    const diagnostics = inspectFirebaseProjectIsolation(preview);
    expect(diagnostics).toMatchObject({
      safe: true,
      publicStorageBucketMatchesExpected: true,
      serverStorageBucketMatchesExpected: true,
      previewStorageSeparatedFromProduction: true,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('appspot.com');
  });

  it('allows credential-free local emulators only with both hosts and a demo-* project', () => {
    const emulator = {
      NODE_ENV: 'development',
      BIZOSTO_ENVIRONMENT: 'development',
      FIREBASE_EXPECTED_PROJECT_ID: 'demo-bizosto',
      FIREBASE_PRODUCTION_PROJECT_ID: 'prod-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-bizosto',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    } as NodeJS.ProcessEnv;
    expect(inspectFirebaseProjectIsolation(emulator)).toMatchObject({
      safe: true,
      emulatorMode: true,
      adminProjectConfigured: false,
      adminMatchesExpected: true,
    });

    expect(
      inspectFirebaseProjectIsolation({
        ...emulator,
        FIREBASE_EXPECTED_PROJECT_ID: 'real-staging-project',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'real-staging-project',
      } as NodeJS.ProcessEnv).errors,
    ).toContain('EMULATOR_PROJECT_UNSAFE');

    const { FIREBASE_STORAGE_EMULATOR_HOST: _storageHost, ...withoutStorageEmulator } = emulator;
    expect(
      inspectFirebaseProjectIsolation({
        ...withoutStorageEmulator,
        FIREBASE_EXPECTED_STORAGE_BUCKET: 'demo-bizosto.appspot.com',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-bizosto.appspot.com',
      } as NodeJS.ProcessEnv).errors,
    ).toContain('EMULATOR_STORAGE_CONFIGURATION_INCOMPLETE');
  });

  it('never includes credential material in safe diagnostics', () => {
    const diagnostics = getSafeConfigurationDiagnostics(production);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('must-never-appear-in-diagnostics');
    expect(serialized).not.toContain('server@example.invalid');
  });

  it('parses only the service-account project id', () => {
    expect(parseServiceAccountProjectId(serviceAccount('isolated-project'))).toBe(
      'isolated-project',
    );
    expect(parseServiceAccountProjectId('not-json')).toBe('');
  });
});
