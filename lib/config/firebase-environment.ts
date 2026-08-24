/**
 * Firebase project isolation is a deployment boundary, not a naming convention.
 *
 * This module is deliberately pure: callers provide an environment map and receive
 * typed, secret-free diagnostics. The Admin bootstrap and startup environment guard
 * both use the same decision so they cannot drift.
 */

export type DeploymentEnvironment = 'production' | 'preview' | 'development' | 'test' | 'build';

export type FirebaseIsolationErrorCode =
  | 'ADMIN_PROJECT_MISSING'
  | 'EXPECTED_PROJECT_MISSING'
  | 'PRODUCTION_PROJECT_MISSING'
  | 'PUBLIC_PROJECT_MISSING'
  | 'ADMIN_EXPECTED_MISMATCH'
  | 'PUBLIC_EXPECTED_MISMATCH'
  | 'PRODUCTION_EXPECTED_MISMATCH'
  | 'PREVIEW_USES_PRODUCTION_PROJECT'
  | 'ENVIRONMENT_LABEL_MISSING'
  | 'BIZOSTO_ENVIRONMENT_MISMATCH'
  | 'EXPECTED_STORAGE_BUCKET_MISSING'
  | 'PRODUCTION_STORAGE_BUCKET_MISSING'
  | 'PUBLIC_STORAGE_BUCKET_MISSING'
  | 'PUBLIC_STORAGE_BUCKET_MISMATCH'
  | 'SERVER_STORAGE_BUCKET_MISMATCH'
  | 'PRODUCTION_STORAGE_BUCKET_MISMATCH'
  | 'PREVIEW_USES_PRODUCTION_STORAGE_BUCKET'
  | 'EMULATOR_CONFIGURATION_INCOMPLETE'
  | 'EMULATOR_STORAGE_CONFIGURATION_INCOMPLETE'
  | 'EMULATOR_PROJECT_UNSAFE';

export type FirebaseIsolationDiagnostics = {
  deploymentEnvironment: DeploymentEnvironment;
  emulatorMode: boolean;
  storageEmulatorConfigured: boolean;
  environmentLabelConfigured: boolean;
  environmentLabelMatchesDeployment: boolean | null;
  adminProjectConfigured: boolean;
  expectedProjectConfigured: boolean;
  productionProjectConfigured: boolean;
  publicProjectConfigured: boolean;
  expectedStorageBucketConfigured: boolean;
  productionStorageBucketConfigured: boolean;
  publicStorageBucketConfigured: boolean;
  serverStorageBucketConfigured: boolean;
  adminMatchesExpected: boolean;
  publicMatchesExpected: boolean;
  publicStorageBucketMatchesExpected: boolean | null;
  serverStorageBucketMatchesExpected: boolean | null;
  previewStorageSeparatedFromProduction: boolean | null;
  previewSeparatedFromProduction: boolean | null;
  safe: boolean;
  errors: FirebaseIsolationErrorCode[];
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function deploymentEnvironment(env: NodeJS.ProcessEnv = process.env): DeploymentEnvironment {
  if (env.NODE_ENV === 'test') return 'test';
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  if (env.VERCEL_ENV === 'development') return 'development';
  // Outside Vercel, the explicit Bizosto label is authoritative. This also makes
  // a staging server use preview-grade isolation instead of being mistaken for
  // production merely because Next.js sets NODE_ENV=production.
  if (env.BIZOSTO_ENVIRONMENT === 'production') return 'production';
  if (env.BIZOSTO_ENVIRONMENT === 'staging') return 'preview';
  if (env.BIZOSTO_ENVIRONMENT === 'test') return 'test';
  if (env.BIZOSTO_ENVIRONMENT === 'development') return 'development';
  if (env.NEXT_PHASE === 'phase-production-build') return 'build';
  // A non-Vercel production server must receive the same fail-closed checks.
  if (env.NODE_ENV === 'production') return 'production';
  return 'development';
}

export function isNonRuntimePhase(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'test') return true;
  // A generic local build may lint/type-check without credentials. A production or
  // preview build has enough target metadata to enforce isolation before the browser
  // Firebase project ID is inlined into its output, so it must never be bypassed.
  return (
    env.NEXT_PHASE === 'phase-production-build' &&
    !clean(env.VERCEL_ENV) &&
    !['production', 'staging'].includes(clean(env.BIZOSTO_ENVIRONMENT))
  );
}

export function parseServiceAccountProjectId(rawKey: string | undefined): string {
  if (!rawKey) return '';
  try {
    const parsed = JSON.parse(rawKey) as { project_id?: unknown } | null;
    return clean(parsed?.project_id);
  } catch {
    return '';
  }
}

export function isFirebaseEmulatorMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const deployment = deploymentEnvironment(env);
  const expectedProjectId = clean(env.FIREBASE_EXPECTED_PROJECT_ID);
  const publicProjectId = clean(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  return (
    (deployment === 'development' || deployment === 'test') &&
    Boolean(clean(env.FIRESTORE_EMULATOR_HOST)) &&
    Boolean(clean(env.FIREBASE_AUTH_EMULATOR_HOST)) &&
    expectedProjectId.startsWith('demo-') &&
    publicProjectId === expectedProjectId
  );
}

export function inspectFirebaseProjectIsolation(
  env: NodeJS.ProcessEnv = process.env,
  adminProjectId = parseServiceAccountProjectId(env.FIREBASE_ADMIN_KEY),
): FirebaseIsolationDiagnostics {
  const deployment = deploymentEnvironment(env);
  const expectedProjectId = clean(env.FIREBASE_EXPECTED_PROJECT_ID);
  const productionProjectId = clean(env.FIREBASE_PRODUCTION_PROJECT_ID);
  const publicProjectId = clean(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const environmentLabel = clean(env.BIZOSTO_ENVIRONMENT);
  const expectedStorageBucket = clean(env.FIREBASE_EXPECTED_STORAGE_BUCKET);
  const productionStorageBucket = clean(env.FIREBASE_PRODUCTION_STORAGE_BUCKET);
  const publicStorageBucket = clean(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const serverStorageBucket = clean(env.FIREBASE_STORAGE_BUCKET);
  const storageEmulatorConfigured = Boolean(clean(env.FIREBASE_STORAGE_EMULATOR_HOST));
  const emulatorMode = isFirebaseEmulatorMode(env);
  const emulatorHostCount = [
    clean(env.FIRESTORE_EMULATOR_HOST),
    clean(env.FIREBASE_AUTH_EMULATOR_HOST),
  ].filter(Boolean).length;
  const resolvedAdminProjectId = clean(adminProjectId) || (emulatorMode ? expectedProjectId : '');
  const errors: FirebaseIsolationErrorCode[] = [];

  if (emulatorHostCount === 1) errors.push('EMULATOR_CONFIGURATION_INCOMPLETE');
  if (emulatorHostCount > 0 && !emulatorMode) errors.push('EMULATOR_PROJECT_UNSAFE');
  if (storageEmulatorConfigured && !emulatorMode) errors.push('EMULATOR_PROJECT_UNSAFE');

  if (!resolvedAdminProjectId) errors.push('ADMIN_PROJECT_MISSING');
  if (!expectedProjectId) errors.push('EXPECTED_PROJECT_MISSING');
  if (!publicProjectId) errors.push('PUBLIC_PROJECT_MISSING');

  const strictDeployment = deployment === 'production' || deployment === 'preview';
  if (strictDeployment && !environmentLabel) {
    errors.push('ENVIRONMENT_LABEL_MISSING');
  }

  const expectedEnvironmentLabel =
    deployment === 'production'
      ? 'production'
      : deployment === 'preview'
        ? 'staging'
        : deployment === 'development'
          ? 'development'
          : deployment === 'test'
            ? 'test'
            : null;
  const environmentLabelMatchesDeployment =
    environmentLabel && expectedEnvironmentLabel
      ? environmentLabel === expectedEnvironmentLabel
      : null;
  if (environmentLabelMatchesDeployment === false) {
    errors.push('BIZOSTO_ENVIRONMENT_MISMATCH');
  }

  if (strictDeployment && !productionProjectId) {
    errors.push('PRODUCTION_PROJECT_MISSING');
  }

  const storageConfigured = Boolean(
    expectedStorageBucket || productionStorageBucket || publicStorageBucket || serverStorageBucket,
  );
  if (emulatorMode && storageConfigured && !storageEmulatorConfigured) {
    errors.push('EMULATOR_STORAGE_CONFIGURATION_INCOMPLETE');
  }
  if (storageConfigured && !expectedStorageBucket) {
    errors.push('EXPECTED_STORAGE_BUCKET_MISSING');
  }
  if (storageConfigured && !publicStorageBucket) {
    errors.push('PUBLIC_STORAGE_BUCKET_MISSING');
  }
  if (strictDeployment && storageConfigured && !productionStorageBucket) {
    errors.push('PRODUCTION_STORAGE_BUCKET_MISSING');
  }
  const publicStorageBucketMatchesExpected = storageConfigured
    ? Boolean(
        publicStorageBucket &&
        expectedStorageBucket &&
        publicStorageBucket === expectedStorageBucket,
      )
    : null;
  if (publicStorageBucketMatchesExpected === false) {
    errors.push('PUBLIC_STORAGE_BUCKET_MISMATCH');
  }
  const serverStorageBucketMatchesExpected = serverStorageBucket
    ? Boolean(expectedStorageBucket && serverStorageBucket === expectedStorageBucket)
    : null;
  if (serverStorageBucketMatchesExpected === false) {
    errors.push('SERVER_STORAGE_BUCKET_MISMATCH');
  }

  const adminMatchesExpected =
    Boolean(resolvedAdminProjectId && expectedProjectId) &&
    resolvedAdminProjectId === expectedProjectId;
  const publicMatchesExpected =
    Boolean(publicProjectId && expectedProjectId) && publicProjectId === expectedProjectId;

  if (resolvedAdminProjectId && expectedProjectId && !adminMatchesExpected) {
    errors.push('ADMIN_EXPECTED_MISMATCH');
  }
  if (publicProjectId && expectedProjectId && !publicMatchesExpected) {
    errors.push('PUBLIC_EXPECTED_MISMATCH');
  }

  let previewSeparatedFromProduction: boolean | null = null;
  if (deployment === 'production' && expectedProjectId && productionProjectId) {
    if (expectedProjectId !== productionProjectId) {
      errors.push('PRODUCTION_EXPECTED_MISMATCH');
    }
  }
  if (
    deployment === 'production' &&
    expectedStorageBucket &&
    productionStorageBucket &&
    expectedStorageBucket !== productionStorageBucket
  ) {
    errors.push('PRODUCTION_STORAGE_BUCKET_MISMATCH');
  }

  let previewStorageSeparatedFromProduction: boolean | null = null;
  if (deployment === 'preview' && expectedProjectId && productionProjectId) {
    previewSeparatedFromProduction = expectedProjectId !== productionProjectId;
    if (
      !previewSeparatedFromProduction ||
      publicProjectId === productionProjectId ||
      resolvedAdminProjectId === productionProjectId
    ) {
      errors.push('PREVIEW_USES_PRODUCTION_PROJECT');
    }
  }
  if (
    deployment === 'preview' &&
    expectedStorageBucket &&
    productionStorageBucket &&
    publicStorageBucket
  ) {
    previewStorageSeparatedFromProduction =
      expectedStorageBucket !== productionStorageBucket &&
      publicStorageBucket !== productionStorageBucket &&
      (!serverStorageBucket || serverStorageBucket !== productionStorageBucket);
    if (!previewStorageSeparatedFromProduction) {
      errors.push('PREVIEW_USES_PRODUCTION_STORAGE_BUCKET');
    }
  }

  return {
    deploymentEnvironment: deployment,
    emulatorMode,
    storageEmulatorConfigured,
    environmentLabelConfigured: Boolean(environmentLabel),
    environmentLabelMatchesDeployment,
    adminProjectConfigured: Boolean(clean(adminProjectId)),
    expectedProjectConfigured: Boolean(expectedProjectId),
    productionProjectConfigured: Boolean(productionProjectId),
    publicProjectConfigured: Boolean(publicProjectId),
    expectedStorageBucketConfigured: Boolean(expectedStorageBucket),
    productionStorageBucketConfigured: Boolean(productionStorageBucket),
    publicStorageBucketConfigured: Boolean(publicStorageBucket),
    serverStorageBucketConfigured: Boolean(serverStorageBucket),
    adminMatchesExpected,
    publicMatchesExpected,
    publicStorageBucketMatchesExpected,
    serverStorageBucketMatchesExpected,
    previewSeparatedFromProduction,
    previewStorageSeparatedFromProduction,
    safe: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

export function assertFirebaseProjectIsolation(
  env: NodeJS.ProcessEnv = process.env,
  adminProjectId = parseServiceAccountProjectId(env.FIREBASE_ADMIN_KEY),
): FirebaseIsolationDiagnostics {
  const diagnostics = inspectFirebaseProjectIsolation(env, adminProjectId);
  if (diagnostics.safe || isNonRuntimePhase(env)) return diagnostics;

  throw new Error(
    `Firebase project isolation check failed for ${diagnostics.deploymentEnvironment}: ` +
      diagnostics.errors.join(', '),
  );
}
