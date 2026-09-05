import crypto from 'crypto';
import * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { releaseStaffSeat, reserveStaffSeat } from '@/lib/billing/seat-reservation';
import { isUserAccessDisabled } from '@/lib/auth/user-access-state';
import { syncUserClaims } from '@/lib/auth/sync-user-claims';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';

export type SsoProvider = 'google' | 'microsoft' | 'okta' | 'auth0';

type OAuthProviderDefinition = {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
};

export type SsoConnection = {
  provider: SsoProvider;
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  tenantHint?: string | null;
  allowedDomains: string[];
  autoProvision: boolean;
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

type OAuthStateRecord = {
  tenantId: string;
  provider: SsoProvider;
  codeVerifier: string;
  nonce: string;
  mode: 'login' | 'link';
  linkedUid?: string;
  returnTo: string;
  createdAt: FirebaseFirestore.FieldValue;
  expiresAt: FirebaseFirestore.Timestamp;
  consumedAt?: FirebaseFirestore.FieldValue;
};

type OAuthTokenResponse = {
  access_token: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export type SsoIdentity = {
  provider: SsoProvider;
  providerUserId: string;
  email: string;
  displayName: string;
  tenantHint?: string;
  rawProfile: Record<string, unknown>;
};

const OAUTH_STATE_COLLECTION = 'ssoOAuthStates';
const SSO_CONNECTION_SUBCOLLECTION = 'ssoConnections';
const USER_SSO_MAPPING_COLLECTION = 'userSsoMappings';
const SSO_AUDIT_SUBCOLLECTION = 'ssoAuditLogs';

const PROVIDER_DEFINITIONS: Record<SsoProvider, OAuthProviderDefinition> = {
  google: {
    authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  microsoft: {
    authorizeEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    scopes: ['openid', 'email', 'profile', 'User.Read'],
  },
  okta: {
    authorizeEndpoint: '',
    tokenEndpoint: '',
    userInfoEndpoint: '',
    scopes: ['openid', 'email', 'profile'],
  },
  auth0: {
    authorizeEndpoint: '',
    tokenEndpoint: '',
    userInfoEndpoint: '',
    scopes: ['openid', 'email', 'profile'],
  },
};

function hashSha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

function randomString(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    return `https://${vercel.replace(/\/$/, '')}`;
  }
  return 'http://localhost:3000';
}

function getConnectionRef(tenantId: string, provider: SsoProvider) {
  return adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection(SSO_CONNECTION_SUBCOLLECTION)
    .doc(provider);
}

export function getSsoProviderDefinitions() {
  return PROVIDER_DEFINITIONS;
}

export async function listEnabledSsoProviders(tenantId: string) {
  const snap = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection(SSO_CONNECTION_SUBCOLLECTION)
    .get();

  return snap.docs
    .map((doc) => ({ provider: doc.id as SsoProvider, ...(doc.data() as Partial<SsoConnection>) }))
    .filter((row) => row.enabled)
    .map((row) => ({
      provider: row.provider,
      allowedDomains: row.allowedDomains || [],
      autoProvision: row.autoProvision !== false,
    }));
}

export async function saveSsoConnection(
  tenantId: string,
  provider: SsoProvider,
  payload: Omit<SsoConnection, 'provider' | 'tenantId'>,
  actorUid: string,
) {
  const definition = PROVIDER_DEFINITIONS[provider];
  if (!definition) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const record: SsoConnection = {
    provider,
    tenantId,
    enabled: payload.enabled,
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    tenantHint: payload.tenantHint || null,
    allowedDomains: payload.allowedDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
    autoProvision: payload.autoProvision,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  };

  await getConnectionRef(tenantId, provider).set(record, { merge: true });
  await logSsoAudit(tenantId, {
    event: 'sso.configuration.updated',
    provider,
    status: 'success',
    actorUid,
    metadata: { enabled: record.enabled, domains: record.allowedDomains.length },
  });

  return record;
}

export async function getSsoConnection(
  tenantId: string,
  provider: SsoProvider,
): Promise<SsoConnection | null> {
  const snap = await getConnectionRef(tenantId, provider).get();
  if (!snap.exists) {
    return null;
  }
  return snap.data() as SsoConnection;
}

export async function createOAuthAuthorizationUrl(params: {
  tenantId: string;
  provider: SsoProvider;
  mode?: 'login' | 'link';
  linkedUid?: string;
  returnTo?: string;
}) {
  const { tenantId, provider } = params;
  const mode = params.mode || 'login';
  const returnTo = params.returnTo || '/';

  const config = await getSsoConnection(tenantId, provider);
  if (!config || !config.enabled) {
    throw new Error('SSO provider is not enabled for this tenant.');
  }

  const definition = PROVIDER_DEFINITIONS[provider];
  if (!definition?.authorizeEndpoint) {
    throw new Error('Provider is not yet supported in this deployment.');
  }

  const state = randomString(32);
  const nonce = randomString(24);
  const codeVerifier = randomString(64);
  const codeChallenge = hashSha256(codeVerifier);

  const callbackUrl = `${getAppBaseUrl()}/api/auth/sso/${provider}/callback`;

  const stateRecord: OAuthStateRecord = {
    tenantId,
    provider,
    codeVerifier,
    nonce,
    mode,
    linkedUid: params.linkedUid,
    returnTo,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
  };

  await adminDb.collection(OAUTH_STATE_COLLECTION).doc(state).set(stateRecord);

  const authorizeUrl = new URL(definition.authorizeEndpoint);
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', definition.scopes.join(' '));
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('prompt', 'select_account');

  if (provider === 'microsoft') {
    authorizeUrl.searchParams.set('tenant', config.tenantHint || 'common');
  }

  return {
    state,
    authorizeUrl: authorizeUrl.toString(),
  };
}

async function exchangeOAuthCode(params: {
  provider: SsoProvider;
  connection: SsoConnection;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const { provider, connection, code, codeVerifier, redirectUri } = params;
  const definition = PROVIDER_DEFINITIONS[provider];

  let tokenEndpoint = definition.tokenEndpoint;
  if (provider === 'microsoft' && connection.tenantHint) {
    tokenEndpoint = `https://login.microsoftonline.com/${connection.tenantHint}/oauth2/v2.0/token`;
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: connection.clientId,
      client_secret: connection.clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Token exchange failed: ${payload}`);
  }

  return (await response.json()) as OAuthTokenResponse;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) return {};
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function fetchProviderUserInfo(provider: SsoProvider, accessToken: string) {
  const definition = PROVIDER_DEFINITIONS[provider];
  const response = await fetch(definition.userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Failed to fetch user profile: ${payload}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function extractIdentity(
  provider: SsoProvider,
  profile: Record<string, unknown>,
  idTokenPayload?: Record<string, unknown>,
): SsoIdentity {
  const email = String(profile.email || idTokenPayload?.email || '').toLowerCase();
  const providerUserId = String(profile.sub || profile.id || idTokenPayload?.sub || '');
  const displayName = String(profile.name || profile.preferred_username || email);
  const tenantHint = String(profile.tid || idTokenPayload?.tid || '');

  if (!email || !providerUserId) {
    throw new Error('Provider profile missing required identity fields.');
  }

  return {
    provider,
    providerUserId,
    email,
    displayName,
    tenantHint,
    rawProfile: profile,
  };
}

function assertAllowedDomain(email: string, allowedDomains: string[]) {
  if (!allowedDomains.length) return;
  const domain = email.split('@')[1]?.toLowerCase() || '';
  if (!allowedDomains.includes(domain)) {
    throw new Error('Your email domain is not allowed for this organization.');
  }
}

/**
 * Resolves the SSO subject inside the tenant that is signing them in, and separately
 * reports whether the address is already claimed by another workspace.
 *
 * The lookup used to be a single unscoped `limit(1)` query on email. With one address
 * present in two workspaces it returned an arbitrary one of them, so a legitimate
 * member of tenant B could be refused because tenant A's record happened to be first.
 * Scoping the match to the signing-in tenant fixes that WITHOUT relaxing the boundary:
 * an address that exists only in another tenant is still refused.
 */
async function findTenantUserByEmail(tenantId: string, email: string) {
  const [scopedSnap, anySnap] = await Promise.all([
    adminDb
      .collection('users')
      .where('email', '==', email)
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get(),
    adminDb.collection('users').where('email', '==', email).limit(1).get(),
  ]);

  if (!scopedSnap.empty) {
    const doc = scopedSnap.docs[0];
    return {
      match: { uid: doc.id, data: doc.data() as Record<string, unknown> },
      existsInAnotherTenant: false,
    };
  }

  return { match: null, existsInAnotherTenant: !anySnap.empty };
}

async function upsertUserSsoMapping(params: {
  tenantId: string;
  uid: string;
  identity: SsoIdentity;
}) {
  const { tenantId, uid, identity } = params;
  const mappingId = `${tenantId}_${identity.provider}_${identity.providerUserId}`;
  await adminDb.collection(USER_SSO_MAPPING_COLLECTION).doc(mappingId).set(
    {
      mappingId,
      tenantId,
      uid,
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email: identity.email,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await adminDb
    .collection('users')
    .doc(uid)
    .set(
      {
        sso: {
          providers: {
            [identity.provider]: {
              providerUserId: identity.providerUserId,
              email: identity.email,
              linkedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
        },
      },
      { merge: true },
    );
}

async function autoProvisionUser(tenantId: string, identity: SsoIdentity) {
  const targetRole = 'sales';
  const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) {
    throw new Error('Tenant not found.');
  }

  const rolesEnabled = resolveTenantRoles(tenantSnap.data()?.rolesEnabled);
  if (!isRoleEnabled(rolesEnabled, targetRole)) {
    throw new Error(
      'Automatic SSO provisioning is unavailable because the sales role is disabled.',
    );
  }

  // Atomic staff-seat reservation. An unauthenticated identity provider callback can
  // arrive many times at once, so this is the seat path most exposed to concurrency.
  const seat = await reserveStaffSeat(tenantId, targetRole, 'sso_auto_provision');
  if (!seat.ok) {
    throw new Error('This workspace has reached its plan limit for team members.');
  }

  try {
    const userRecord = await adminAuth.createUser({
      email: identity.email,
      displayName: identity.displayName,
      emailVerified: true,
    });

    try {
      // SSO must provision through the same two enforcement planes as every other staff
      // creation path. Without role + tenant claims, the account exists in Firestore but
      // cannot be trusted by Firestore rules or middleware.
      await syncUserClaims({
        uid: userRecord.uid,
        role: targetRole,
        tenantId,
        endSessions: false,
      });

      await adminDb.collection('users').doc(userRecord.uid).set(
        {
          uid: userRecord.uid,
          email: identity.email,
          name: identity.displayName,
          displayName: identity.displayName,
          role: targetRole,
          status: 'active',
          isActive: true,
          isDeleted: false,
          tenantId,
          authProvider: 'sso',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      return userRecord.uid;
    } catch (error) {
      await adminAuth.deleteUser(userRecord.uid).catch(() => {});
      throw error;
    }
  } finally {
    await releaseStaffSeat(seat);
  }
}

async function resolveOrProvisionUser(
  tenantId: string,
  identity: SsoIdentity,
  autoProvision: boolean,
) {
  const { match, existsInAnotherTenant } = await findTenantUserByEmail(tenantId, identity.email);

  if (match) {
    // SSO is an authentication route into an EXISTING identity, so it inherits that
    // identity's access state. Without this, a deactivated, suspended, terminated or
    // soft-deleted user whose Firebase Auth record was never disabled — legacy records
    // predate the Auth/Firestore sync, and any single-plane write can drift — could sign
    // in through the identity provider and be handed a custom token, bypassing the
    // deactivation the workspace performed. Fails closed on the application record
    // rather than trusting the other plane to have been updated.
    if (isUserAccessDisabled(match.data)) {
      throw new Error('This account is not active. Contact your administrator.');
    }
    return match.uid;
  }

  if (existsInAnotherTenant) {
    throw new Error('User belongs to a different tenant.');
  }

  if (!autoProvision) {
    throw new Error('No account found. Ask your administrator to create your account first.');
  }

  return autoProvisionUser(tenantId, identity);
}

export async function handleOAuthCallback(params: {
  provider: SsoProvider;
  state: string;
  code: string;
}) {
  const { provider, state, code } = params;
  const stateRef = adminDb.collection(OAUTH_STATE_COLLECTION).doc(state);
  const snap = await stateRef.get();

  if (!snap.exists) {
    throw new Error('Invalid SSO state.');
  }

  const stateData = snap.data() as OAuthStateRecord;
  if (stateData.provider !== provider) {
    throw new Error('SSO state provider mismatch.');
  }

  if (stateData.expiresAt.toDate().getTime() < Date.now()) {
    throw new Error('SSO request expired.');
  }

  if (stateData.consumedAt) {
    throw new Error('SSO request already used.');
  }

  await stateRef.set({ consumedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  const connection = await getSsoConnection(stateData.tenantId, provider);
  if (!connection?.enabled) {
    throw new Error('Provider is not configured for this tenant.');
  }

  const redirectUri = `${getAppBaseUrl()}/api/auth/sso/${provider}/callback`;
  const tokenResponse = await exchangeOAuthCode({
    provider,
    connection,
    code,
    codeVerifier: stateData.codeVerifier,
    redirectUri,
  });

  const idTokenPayload = tokenResponse.id_token
    ? decodeJwtPayload(tokenResponse.id_token)
    : undefined;
  const profile = await fetchProviderUserInfo(provider, tokenResponse.access_token);
  const identity = extractIdentity(provider, profile, idTokenPayload);

  assertAllowedDomain(identity.email, connection.allowedDomains || []);

  if (stateData.mode === 'link') {
    if (!stateData.linkedUid) {
      throw new Error('Missing target user for account linking.');
    }
    await upsertUserSsoMapping({
      tenantId: stateData.tenantId,
      uid: stateData.linkedUid,
      identity,
    });
    await logSsoAudit(stateData.tenantId, {
      event: 'sso.account.linked',
      provider,
      status: 'success',
      actorUid: stateData.linkedUid,
      subjectUid: stateData.linkedUid,
      metadata: { email: identity.email },
    });

    return {
      mode: 'link' as const,
      returnTo: stateData.returnTo,
    };
  }

  const uid = await resolveOrProvisionUser(
    stateData.tenantId,
    identity,
    connection.autoProvision !== false,
  );
  await upsertUserSsoMapping({ tenantId: stateData.tenantId, uid, identity });

  const customToken = await adminAuth.createCustomToken(uid, {
    tenantId: stateData.tenantId,
    ssoProvider: provider,
  });

  await logSsoAudit(stateData.tenantId, {
    event: 'sso.login.success',
    provider,
    status: 'success',
    actorUid: uid,
    subjectUid: uid,
    metadata: { email: identity.email },
  });

  return {
    mode: 'login' as const,
    customToken,
    returnTo: stateData.returnTo,
  };
}

export async function linkSsoForUser(params: {
  tenantId: string;
  uid: string;
  provider: SsoProvider;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const connection = await getSsoConnection(params.tenantId, params.provider);
  if (!connection?.enabled) {
    throw new Error('Provider not configured.');
  }

  const tokenResponse = await exchangeOAuthCode({
    provider: params.provider,
    connection,
    code: params.code,
    codeVerifier: params.codeVerifier,
    redirectUri: params.redirectUri,
  });

  const idTokenPayload = tokenResponse.id_token
    ? decodeJwtPayload(tokenResponse.id_token)
    : undefined;
  const profile = await fetchProviderUserInfo(params.provider, tokenResponse.access_token);
  const identity = extractIdentity(params.provider, profile, idTokenPayload);
  assertAllowedDomain(identity.email, connection.allowedDomains || []);

  await upsertUserSsoMapping({ tenantId: params.tenantId, uid: params.uid, identity });
  await logSsoAudit(params.tenantId, {
    event: 'sso.account.linked',
    provider: params.provider,
    status: 'success',
    actorUid: params.uid,
    subjectUid: params.uid,
    metadata: { email: identity.email },
  });

  return identity;
}

export async function logSsoAudit(
  tenantId: string,
  payload: {
    event: string;
    provider: SsoProvider;
    status: 'success' | 'failure';
    actorUid?: string;
    subjectUid?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection(SSO_AUDIT_SUBCOLLECTION)
    .add({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

export async function listSsoAuditLogs(tenantId: string, limit = 100) {
  const snap = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection(SSO_AUDIT_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(Math.max(limit, 1), 200))
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
}
