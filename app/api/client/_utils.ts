import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { validateSession } from '@/lib/auth/session';

export type SessionUser = {
  uid: string;
  role: string;
  clientId?: string;
  tenantId?: string;
  [key: string]: any;
};

function cleanString(value: any) {
  return String(value ?? '').trim();
}

function normalizeEmail(value: any) {
  return cleanString(value).toLowerCase();
}

async function resolveClientId(uid: string, data: Record<string, any>) {
  const tenantId = String((data as any).tenantId || '').trim();
  const existingClientId = cleanString(data.clientId);
  if (existingClientId) return existingClientId;

  let email = normalizeEmail(
    data.email || data.primaryContactEmail || data.primaryContactEmailLower,
  );
  if (!email) {
    const userRecord = await adminAuth.getUser(uid).catch(() => null);
    email = normalizeEmail(userRecord?.email);
  }

  if (!email) return '';

  const byLower = await adminDb
    .collection('clients')
    .where('tenantId', '==', tenantId)
    .where('primaryContactEmailLower', '==', email)
    .limit(1)
    .get();
  const byRaw = byLower.empty
    ? await adminDb
        .collection('clients')
        .where('tenantId', '==', tenantId)
        .where('primaryContactEmail', '==', email)
        .limit(1)
        .get()
    : null;

  const candidate = byLower.empty ? byRaw?.docs?.[0] : byLower.docs[0];
  if (!candidate) return '';

  const clientData = candidate.data() || {};
  if (clientData.deletedAt) return '';

  const clientId = candidate.id;
  await adminDb
    .collection('users')
    .doc(uid)
    .set({ clientId, updatedAt: new Date().toISOString() }, { merge: true });

  return clientId;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('lac_session')?.value;
    if (!sessionCookie) return null;

    // Internal session ledger is canonical: logout, revoke-all, idle timeout, and
    // concurrent-session limits must apply to client portal requests too.
    const sessionStatus = await validateSession(sessionCookie);
    if (!sessionStatus?.valid) return null;

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data() || {};

    // Fail closed on account status: deactivated or soft-deleted accounts lose
    // portal access on their next request.
    const accountStatus = String(data.status || 'active').toLowerCase();
    const DEACTIVATED_STATUSES = ['inactive', 'suspended', 'disabled', 'deactivated'];
    if (data.isDeleted === true || DEACTIVATED_STATUSES.includes(accountStatus)) {
      return null;
    }

    // Fail closed on tenant: never fall back to DEFAULT_TENANT_ID ("bizosto" is the
    // live primary tenant). A user doc without a tenantId must be rejected, never
    // silently scoped into the primary tenant's data.
    const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : '';
    if (!tenantId) return null;

    const role = (data.role as string | undefined)?.toLowerCase() || 'client';
    const clientId = await resolveClientId(uid, data);

    // Spread data FIRST so computed uid/role/clientId/tenantId always win over raw
    // doc fields (previously ...data was last and could override them).
    return {
      ...data,
      uid,
      role,
      clientId,
      tenantId,
    } as SessionUser;
  } catch (err) {
    console.error('getSessionUser error:', err);
    return null;
  }
}

export function isClientRole(role: string) {
  return String(role || '').toLowerCase() === 'client';
}

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function requireClient() {
  const me = await getSessionUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isClientRole(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  const clientId = String(me.clientId || '').trim();
  if (!clientId) {
    return { ok: false as const, status: 404, error: 'Client profile not found' };
  }
  if (!me.tenantId) {
    return { ok: false as const, status: 403, error: 'Tenant context missing.' };
  }
  return { ok: true as const, user: me, clientId, tenantId: me.tenantId };
}
