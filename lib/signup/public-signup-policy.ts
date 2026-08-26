export const PUBLIC_SIGNUP_DISABLED_MESSAGE =
  'Public signup is not currently available. Contact support@bizosto.com for access.';

export const PUBLIC_SIGNUP_UNAVAILABLE_MESSAGE =
  'Signup availability could not be verified. Please try again later.';

export type PublicSignupDecision =
  | { enabled: true; reason: 'enabled' }
  | {
      enabled: false;
      reason: 'disabled' | 'configuration_missing' | 'configuration_unavailable';
    };

type LaunchChecklistSnapshot = {
  exists: boolean;
  data(): unknown;
};

const RESERVED_TENANT_IDENTIFIERS = new Set([
  'bizosto',
  'bizosto-platform',
  'bizosto-demo',
  'la-creativo',
  'lacreativo',
  'la-creativo-design',
  'lacreativodesign',
  'la-creativo-erp',
]);

const RESERVED_TENANT_PREFIXES = [
  'bizosto-',
  'la-creativo-',
  'lacreativo-',
  'lacreativodesign-',
] as const;

export function toTenantSlugBase(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return slug || 'workspace';
}

export function isReservedTenantIdentifier(value: string): boolean {
  const normalized = toTenantSlugBase(value);
  return (
    RESERVED_TENANT_IDENTIFIERS.has(normalized) ||
    RESERVED_TENANT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

/**
 * Reads the platform-wide signup switch without importing Firebase into this pure policy module.
 * Missing, malformed, or unreadable configuration always fails closed.
 */
export async function readPublicSignupDecision(
  loadLaunchChecklist: () => Promise<LaunchChecklistSnapshot>,
): Promise<PublicSignupDecision> {
  try {
    const snapshot = await loadLaunchChecklist();
    if (!snapshot.exists) {
      return { enabled: false, reason: 'configuration_missing' };
    }

    const data = snapshot.data();
    if (!data || typeof data !== 'object') {
      return { enabled: false, reason: 'configuration_missing' };
    }

    return (data as { publicSignupsEnabled?: unknown }).publicSignupsEnabled === true
      ? { enabled: true, reason: 'enabled' }
      : { enabled: false, reason: 'disabled' };
  } catch {
    return { enabled: false, reason: 'configuration_unavailable' };
  }
}

export function getPublicSignupDenial(decision: PublicSignupDecision): {
  status: 403 | 503;
  code: 'PUBLIC_SIGNUPS_DISABLED' | 'PUBLIC_SIGNUP_CONFIGURATION_UNAVAILABLE';
  error: string;
} | null {
  if (decision.enabled) return null;

  if (decision.reason === 'configuration_unavailable') {
    return {
      status: 503,
      code: 'PUBLIC_SIGNUP_CONFIGURATION_UNAVAILABLE',
      error: PUBLIC_SIGNUP_UNAVAILABLE_MESSAGE,
    };
  }

  return {
    status: 403,
    code: 'PUBLIC_SIGNUPS_DISABLED',
    error: PUBLIC_SIGNUP_DISABLED_MESSAGE,
  };
}
