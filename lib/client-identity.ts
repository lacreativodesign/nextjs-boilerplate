import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';

type ClientIdentityData = {
  primaryContactEmail?: string;
  primaryContactName?: string;
  companyName?: string;
  portalUserUid?: string;
};

export type TenantClientIdentity = {
  uid: string;
  email: string;
  created: boolean;
};

export class ClientIdentityError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
    readonly code = 'CLIENT_IDENTITY_CONFLICT',
  ) {
    super(message);
    this.name = 'ClientIdentityError';
  }
}

function clean(value: unknown): string {
  return String(value || '').trim();
}

function email(value: unknown): string {
  return clean(value).toLowerCase();
}

/**
 * Resolves a client portal identity only from a tenant-owned client document.
 * An Auth email match is never enough: its Firestore identity and claims must
 * already bind to the same tenant/client or the operation fails closed.
 */
export async function ensureTenantClientIdentity(input: {
  tenantId: string;
  clientId: string;
  clientData?: ClientIdentityData;
}): Promise<TenantClientIdentity> {
  const tenantId = clean(input.tenantId);
  const clientId = clean(input.clientId);
  if (!tenantId || !clientId) {
    throw new ClientIdentityError('Tenant and client are required.', 400, 'CLIENT_CONTEXT_MISSING');
  }

  const clientRef = adminDb.collection('clients').doc(clientId);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists || clean(clientSnap.data()?.tenantId) !== tenantId) {
    throw new ClientIdentityError('Client was not found in this tenant.', 404, 'CLIENT_NOT_FOUND');
  }

  const authoritative = clientSnap.data() || {};
  const authoritativeEmail = email(
    authoritative.primaryContactEmail ||
      authoritative.email ||
      input.clientData?.primaryContactEmail,
  );
  if (!authoritativeEmail) {
    throw new ClientIdentityError(
      'Primary contact email is required for portal access.',
      400,
      'CLIENT_EMAIL_REQUIRED',
    );
  }
  const suppliedEmail = email(input.clientData?.primaryContactEmail);
  if (suppliedEmail && suppliedEmail !== authoritativeEmail) {
    throw new ClientIdentityError(
      'Client email does not match the tenant-owned record.',
      409,
      'CLIENT_EMAIL_MISMATCH',
    );
  }

  const requestedUid = clean(authoritative.portalUserUid || input.clientData?.portalUserUid);
  let authUser = requestedUid
    ? await adminAuth.getUser(requestedUid).catch(() => null)
    : await adminAuth.getUserByEmail(authoritativeEmail).catch(() => null);
  let created = false;

  if (authUser) {
    const identitySnap = await adminDb.collection('users').doc(authUser.uid).get();
    const identity = identitySnap.data() || {};
    const boundTenant = clean(identity.tenantId);
    const boundClient = clean(identity.clientId);
    const boundRole = clean(identity.role).toLowerCase();
    if (
      !identitySnap.exists ||
      boundTenant !== tenantId ||
      boundClient !== clientId ||
      boundRole !== 'client'
    ) {
      throw new ClientIdentityError(
        'That authentication identity is already owned by another account or is unbound.',
        409,
        'AUTH_IDENTITY_OWNERSHIP_MISMATCH',
      );
    }
  } else {
    const seatCheck = await checkUserLimit(tenantId, 'client');
    if (!seatCheck.ok) {
      const limit = planLimitResponseBody(seatCheck);
      throw new ClientIdentityError(limit.message, 403, limit.error);
    }

    authUser = await adminAuth.createUser({
      email: authoritativeEmail,
      password: crypto.randomBytes(24).toString('base64url'),
      displayName: clean(
        authoritative.primaryContactName ||
          input.clientData?.primaryContactName ||
          authoritative.companyName ||
          input.clientData?.companyName ||
          authoritativeEmail,
      ),
    });
    created = true;
  }

  const claims = authUser.customClaims || {};
  const claimedTenant = clean(claims.tenantId);
  const claimedRole = clean(claims.role).toLowerCase();
  if ((claimedTenant && claimedTenant !== tenantId) || (claimedRole && claimedRole !== 'client')) {
    throw new ClientIdentityError(
      'Authentication claims conflict with the requested client tenant.',
      409,
      'AUTH_CLAIM_OWNERSHIP_MISMATCH',
    );
  }

  await adminAuth.setCustomUserClaims(authUser.uid, {
    ...claims,
    tenantId,
    role: 'client',
    clientId,
  });

  const now = new Date().toISOString();
  await adminDb
    .collection('users')
    .doc(authUser.uid)
    .set(
      {
        uid: authUser.uid,
        tenantId,
        role: 'client',
        status: 'active',
        clientId,
        email: authoritativeEmail,
        ...(created ? { createdAt: now } : {}),
        updatedAt: now,
      },
      { merge: true },
    );
  await clientRef.set(
    {
      tenantId,
      portalUserUid: authUser.uid,
      updatedAt: now,
    },
    { merge: true },
  );

  return { uid: authUser.uid, email: authoritativeEmail, created };
}
