export const DEMO_TENANT_ID = 'bizosto-demo';
export const DEMO_SEED_CONFIRMATION = 'SEED_BIZOSTO_DEMO';
export const DEMO_RESET_CONFIRMATION = 'RESET_BIZOSTO_DEMO';

type DemoEnvironment = Readonly<Record<string, string | undefined>>;

export type DemoMutationBlockReason =
  | 'invalid_tenant'
  | 'explicit_enable_required'
  | 'environment_missing'
  | 'production_environment'
  | 'unsupported_environment'
  | 'partial_emulator_configuration'
  | 'expected_project_missing'
  | 'actual_project_missing'
  | 'production_project_missing'
  | 'project_mismatch'
  | 'production_project';

export type DemoMutationSafetyDecision =
  | { allowed: true; mode: 'emulator' | 'isolated-project' }
  | {
      allowed: false;
      reason: DemoMutationBlockReason;
    };

const ALLOWED_NON_PRODUCTION_ENVIRONMENTS = new Set(['development', 'preview', 'staging', 'test']);

const PRODUCTION_ENVIRONMENTS = new Set(['live', 'prod', 'production']);
const KNOWN_PRODUCTION_FIREBASE_PROJECT = 'la-creativo-erp';

function normalize(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/** Pure safety decision used by API routes, the CLI, and tests. */
export function evaluateDemoMutationSafety({
  tenantId,
  projectId,
  env = process.env,
}: {
  tenantId: string;
  projectId?: string;
  env?: DemoEnvironment;
}): DemoMutationSafetyDecision {
  if (tenantId !== DEMO_TENANT_ID) {
    return { allowed: false, reason: 'invalid_tenant' };
  }

  if (env.DEMO_DATA_MUTATIONS_ENABLED !== 'true') {
    return { allowed: false, reason: 'explicit_enable_required' };
  }

  const environment = normalize(env.BIZOSTO_ENVIRONMENT || env.VERCEL_ENV || env.NODE_ENV);
  if (!environment) {
    return { allowed: false, reason: 'environment_missing' };
  }
  if (PRODUCTION_ENVIRONMENTS.has(environment) || normalize(env.VERCEL_ENV) === 'production') {
    return { allowed: false, reason: 'production_environment' };
  }
  if (!ALLOWED_NON_PRODUCTION_ENVIRONMENTS.has(environment)) {
    return { allowed: false, reason: 'unsupported_environment' };
  }

  const firestoreEmulator = Boolean(env.FIRESTORE_EMULATOR_HOST);
  const authEmulator = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST);
  if (firestoreEmulator !== authEmulator) {
    return { allowed: false, reason: 'partial_emulator_configuration' };
  }
  if (firestoreEmulator && authEmulator) {
    return { allowed: true, mode: 'emulator' };
  }

  const expectedProjectId = String(env.DEMO_FIREBASE_PROJECT_ID || '').trim();
  const actualProjectId = String(projectId || '').trim();
  if (!expectedProjectId) {
    return { allowed: false, reason: 'expected_project_missing' };
  }
  if (!actualProjectId) {
    return { allowed: false, reason: 'actual_project_missing' };
  }
  if (actualProjectId !== expectedProjectId) {
    return { allowed: false, reason: 'project_mismatch' };
  }

  const configuredProductionProjectId = String(env.FIREBASE_PRODUCTION_PROJECT_ID || '').trim();
  if (!configuredProductionProjectId) {
    return { allowed: false, reason: 'production_project_missing' };
  }

  const productionProjectIds = new Set(
    [KNOWN_PRODUCTION_FIREBASE_PROJECT, configuredProductionProjectId]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  if (productionProjectIds.has(actualProjectId)) {
    return { allowed: false, reason: 'production_project' };
  }

  return { allowed: true, mode: 'isolated-project' };
}

export class DemoMutationBlockedError extends Error {
  readonly code = 'DEMO_MUTATION_BLOCKED';

  constructor(readonly reason: DemoMutationBlockReason) {
    super('Demo mutation blocked by environment safety policy.');
    this.name = 'DemoMutationBlockedError';
  }
}

export class DemoCredentialConfigurationError extends Error {
  readonly code = 'DEMO_CREDENTIAL_CONFIGURATION_INVALID';

  constructor() {
    super('Demo account credentials are not safely configured.');
    this.name = 'DemoCredentialConfigurationError';
  }
}

export function assertDemoMutationAllowed(params: {
  tenantId: string;
  projectId?: string;
  env?: DemoEnvironment;
}): 'emulator' | 'isolated-project' {
  const decision = evaluateDemoMutationSafety(params);
  if (!decision.allowed) {
    throw new DemoMutationBlockedError(decision.reason);
  }
  return decision.mode;
}

export function parseDemoUserPasswords(
  raw: string | undefined,
  userEmails: readonly string[],
): Readonly<Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw || ''));
  } catch {
    throw new DemoCredentialConfigurationError();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DemoCredentialConfigurationError();
  }

  const source = parsed as Record<string, unknown>;
  const passwords: Record<string, string> = {};
  const uniquePasswords = new Set<string>();
  const expectedEmails = new Set(userEmails);

  if (
    Object.keys(source).length !== expectedEmails.size ||
    Object.keys(source).some((email) => !expectedEmails.has(email))
  ) {
    throw new DemoCredentialConfigurationError();
  }

  for (const email of userEmails) {
    const password = source[email];
    const emailLocalPart = email.split('@')[0]?.toLowerCase() || '';
    if (
      typeof password !== 'string' ||
      password.length < 16 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password) ||
      password.toLowerCase().includes('bizosto') ||
      (emailLocalPart && password.toLowerCase().includes(emailLocalPart)) ||
      uniquePasswords.has(password)
    ) {
      throw new DemoCredentialConfigurationError();
    }

    uniquePasswords.add(password);
    passwords[email] = password;
  }

  return passwords;
}
