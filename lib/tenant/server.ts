import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_MODULES, DEFAULT_ROLES, DEFAULT_TENANT_BRAND, DEFAULT_TENANT_ID } from '@/lib/tenant/constants';
import { PLAN_MODULES } from '@/app/config/plans';
import { refreshSession, validateSession } from '@/lib/auth/session';
import { captureApiError, setSentryContext, trackDbQuery } from '@/lib/monitoring/sentry';

export type TenantModules = typeof DEFAULT_MODULES;

export type TenantRecord = {
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  brand: { name: string; logoUrl: string | null; locked: true };
  whiteLabel?: {
    logoUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    themeMode?: 'light' | 'dark' | 'system';
    customDomains?: Array<{
      domain: string;
      status: 'pending' | 'verified';
      verificationToken: string;
      verifiedAt: string | null;
    }>;
    emailBranding?: {
      fromName?: string;
      fromEmail?: string;
      emailFooter?: string;
      status?: 'pending' | 'verified';
      spfValid?: boolean;
      dkimValid?: boolean;
      verifiedAt?: string | null;
    };
  };
  modulesEnabled: TenantModules;
  rolesEnabled?: typeof DEFAULT_ROLES;
  plan?: 'starter' | 'pro' | 'enterprise';
  modules?: Record<string, boolean>;
  stripeConnect?: {
    enabled?: boolean;
    accountId?: string;
    accountEmail?: string | null;
    status?: 'connected' | 'disconnected';
    connectedAt?: any;
    disconnectedAt?: any;
    oauthState?: string | null;
    oauthRequestedAt?: any;
    firstPaymentAt?: any;
  };
  subscriptionState?: 'active' | 'grace' | 'soft_locked' | 'hard_locked';
  billingStatus?: 'active' | 'past_due' | 'canceled';
  planSetBy?: { uid: string; role: 'super_admin' };
  planUpdatedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string | null;
};

export type CurrentUser = {
  uid: string;
  role: string;
  tenantId?: string;
  status?: string;
  displayName?: string;
  email?: string;
  [key: string]: any;
};

type RequestCookies =
  | {
      get?: (name: string) => { value?: string } | undefined;
      [key: string]: any;
    }
  | Record<string, string | undefined>;

type RequestLike = {
  cookies?: RequestCookies;
  headers?:
    | Record<string, string | string[] | undefined>
    | { get?: (name: string) => string | null };
  nextUrl?: { searchParams?: URLSearchParams };
  query?: Record<string, string | string[] | undefined>;
};

function readCookie(req: RequestLike | undefined, name: string) {
  const cookies = req?.cookies;
  if (!cookies) return null;
  if (
    typeof (cookies as { get?: (cookieName: string) => { value?: string } | undefined }).get ===
    'function'
  ) {
    return (
      (cookies as { get: (cookieName: string) => { value?: string } | undefined }).get(name)
        ?.value || null
    );
  }
  return (cookies as Record<string, string | undefined>)[name] || null;
}

function readQueryTenantId(req?: RequestLike) {
  const nextQuery = req?.nextUrl?.searchParams?.get('tenantId');
  if (nextQuery) return nextQuery;
  const query = req?.query?.tenantId;
  if (Array.isArray(query)) return query[0] || null;
  return query || null;
}

export function isSuperAdmin(user: Pick<CurrentUser, 'role'>) {
  return (user.role || '').toLowerCase() === 'super_admin';
}

export function isAdmin(user: Pick<CurrentUser, 'role'>) {
  const role = (user.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

export function isSales(user: Pick<CurrentUser, 'role'>) {
  const role = (user.role || '').toLowerCase();
  return role === 'sales';
}

export async function getCurrentUserOrThrow(req?: RequestLike): Promise<CurrentUser> {
  try {
    const sessionCookie = readCookie(req, 'lac_session');
    if (!sessionCookie) {
      throw new Error('Unauthorized');
    }

    const sessionStatus = await validateSession(sessionCookie);
    if (!sessionStatus.valid) {
      throw new Error('Session expired');
    }

    const decoded = await trackDbQuery('auth.verify', 'verifySessionCookie', async () =>
      adminAuth.verifySessionCookie(sessionCookie, true),
    );
    const uid = decoded.uid;

    const userDoc = await trackDbQuery('db.query', 'users.getCurrentUser', async () =>
      adminDb.collection('users').doc(uid).get(),
    );
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const data = userDoc.data() || {};
    const role = (data.role as string | undefined)?.toLowerCase() || 'sales';
    const tenantId = (data.tenantId as string | undefined) || DEFAULT_TENANT_ID;

    void refreshSession(sessionCookie);

    setSentryContext({
      userId: uid,
      email: typeof data.email === 'string' ? data.email : undefined,
      role,
      tenantId,
    });

    return {
      uid,
      role,
      tenantId,
      ...data,
    };
  } catch (error) {
    captureApiError(error, {
      fingerprint: ['getCurrentUserOrThrow'],
      path: req?.nextUrl?.searchParams ? 'middleware/request' : undefined,
    });
    throw error;
  }
}

export async function ensureDefaultTenant() {
  const ref = adminDb.collection('tenants').doc(DEFAULT_TENANT_ID);
  const snap = await trackDbQuery('db.query', 'tenants.ensureDefaultTenant.get', async () =>
    ref.get(),
  );
  if (snap.exists) return snap.data() as TenantRecord;

  const now = new Date().toISOString();
  const payload: TenantRecord = {
    name: 'BIZOSTO',
    slug: 'bizosto',
    status: 'active',
    brand: DEFAULT_TENANT_BRAND,
    modulesEnabled: DEFAULT_MODULES,
    rolesEnabled: DEFAULT_ROLES,
    plan: 'pro',
    modules: PLAN_MODULES.pro,
    planSetBy: { uid: 'system', role: 'super_admin' },
    planUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    updatedBy: 'system',
  };

  await trackDbQuery('db.query', 'tenants.ensureDefaultTenant.set', async () =>
    ref.set(payload, { merge: true }),
  );
  return payload;
}

export async function getTenantIdForRequestOrThrow(req?: RequestLike): Promise<string> {
  const user = await getCurrentUserOrThrow(req);
  let tenantId = user.tenantId || DEFAULT_TENANT_ID;

  if (isSuperAdmin(user)) {
    const cookieTenant = readCookie(req, 'bizosto_tenant');
    const queryTenant = readQueryTenantId(req);
    tenantId = queryTenant || cookieTenant || tenantId;
  }

  if (!tenantId) {
    tenantId = DEFAULT_TENANT_ID;
  }

  const tenantRef = adminDb.collection('tenants').doc(tenantId);
  let tenantSnap = await trackDbQuery('db.query', 'tenants.getTenantForRequest', async () =>
    tenantRef.get(),
  );

  if (!tenantSnap.exists && tenantId === DEFAULT_TENANT_ID) {
    await ensureDefaultTenant();
    tenantSnap = await trackDbQuery('db.query', 'tenants.getDefaultTenantAfterCreate', async () =>
      tenantRef.get(),
    );
  }

  if (!tenantSnap.exists) {
    throw new Error('Tenant not found');
  }

  const tenant = tenantSnap.data() as TenantRecord;
  if (tenant.status === 'suspended' && !isSuperAdmin(user)) {
    throw new Error('Tenant suspended');
  }

  return tenantId;
}

export async function getTenantRecordOrThrow(tenantId: string): Promise<TenantRecord> {
  const snap = await trackDbQuery('db.query', 'tenants.getTenantRecord', async () =>
    adminDb.collection('tenants').doc(tenantId).get(),
  );
  if (!snap.exists) {
    throw new Error('Tenant not found');
  }
  return snap.data() as TenantRecord;
}

export async function requireModuleOrThrow(tenantId: string, moduleKey: keyof TenantModules) {
  const tenant = await getTenantRecordOrThrow(tenantId);
  const enabled = tenant.modulesEnabled?.[moduleKey];
  if (!enabled) {
    throw new Error(`Module disabled: ${moduleKey}`);
  }
  return true;
}
