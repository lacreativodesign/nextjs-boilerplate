import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_TENANT_ID } from '@/lib/tenant/constants';
import { refreshSession, validateSession } from '@/lib/auth/session';
import { captureApiError, setSentryContext, trackDbQuery } from '@/lib/monitoring/sentry';

export type CurrentUser = {
  uid: string;
  role: string;
  // we also spread all user doc fields into this object
  [key: string]: unknown;
};

// Central helper: get the currently logged in admin user
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = cookies();

    // Use the SAME cookie as middleware + app/page.tsx + session-login
    const sessionCookie = cookieStore.get('lac_session')?.value;
    if (!sessionCookie) return null;

    let sessionStatus: { valid: boolean; uid?: string; expired?: boolean } | null = null;
    try {
      sessionStatus = await validateSession(sessionCookie);
    } catch (err) {
      console.error('getCurrentUser validateSession error:', err);
    }

    const decoded = await trackDbQuery('auth.verify', 'admin.verifySessionCookie', async () =>
      adminAuth.verifySessionCookie(sessionCookie, true),
    );
    const uid = decoded.uid;

    const userDoc = await trackDbQuery('db.query', 'admin.users.getCurrentUser', async () =>
      adminDb.collection('users').doc(uid).get(),
    );
    if (!userDoc.exists) return null;

    const data = userDoc.data() || {};
    const role = normalizeRole((data.role as string | undefined) || 'sales');

    if (sessionStatus?.expired === true && role !== 'super_admin') {
      return null;
    }

    const tenantId = (data.tenantId as string | undefined) || DEFAULT_TENANT_ID;

    void refreshSession(sessionCookie);

    setSentryContext({
      userId: uid,
      email: typeof data.email === 'string' ? data.email : undefined,
      role,
      tenantId,
    });

    const current = {
      uid,
      role,
      tenantId,
      ...data,
    };


    return current;
  } catch (err) {
    captureApiError(err, { fingerprint: ['admin.getCurrentUser'] });
    console.error('getCurrentUser error:', err);
    return null;
  }
}

// Role checks
export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === 'super_admin';
}

export function normalizeRole(role?: string) {
  return (role || '')
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/^account_manager$/, 'am');
}

export function isAdminOrSuper(role: string) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin';
}

export function isSalesManager(role: string) {
  return normalizeRole(role) === 'sales_manager';
}

export function isAccountManager(role: string) {
  return normalizeRole(role) === 'am';
}

export function isProduction(role: string) {
  return normalizeRole(role) === 'production';
}

export function isProductionManager(role: string) {
  return normalizeRole(role) === 'production_manager';
}

export function isAmManager(role: string) {
  return normalizeRole(role) === 'am_manager';
}

export async function requireAdminOrSuperAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, user: me };
}

export async function requireSalesManagerOrAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isSalesManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, user: me };
}

export async function requireProductionManagerOrAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isProductionManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, user: me };
}

export async function requireAmManagerOrAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isAmManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, user: me };
}
