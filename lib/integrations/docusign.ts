import crypto from 'crypto';
import admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { getStorageBucketName } from '@/lib/storage/bucket';

const DOCUSIGN_DOC_ID = 'docusign';
const DOCUSIGN_STATE_COLLECTION = 'docusignOAuthStates';

export type DocusignConnection = {
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  baseUri: string | null;
  scopes: string[];
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  accessTokenExpiresAt: string | null;
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

type OAuthStatePayload = {
  tenantId: string;
  userUid: string;
  returnTo: string;
  createdAt: FirebaseFirestore.FieldValue;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type UserInfoResponse = {
  accounts?: Array<{
    account_id: string;
    account_name: string;
    base_uri: string;
    is_default: boolean;
  }>;
};

export type DocusignEnvelopeRecord = {
  tenantId: string;
  envelopeId: string;
  status: string;
  subject: string;
  message: string;
  signerEmails: string[];
  sourceFileName: string;
  docusignDocumentId: string;
  createdBy: string;
  createdByEmail: string;
  sentAt: string;
  completedAt: string | null;
  signedStoragePath: string | null;
  signedDocumentFileName: string | null;
  signedDocumentSize: number | null;
  signedDocumentDownloadedAt: string | null;
  updatedAt?: FirebaseFirestore.FieldValue | string;
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

function getOAuthConfig() {
  const clientId = String(process.env.DOCUSIGN_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.DOCUSIGN_CLIENT_SECRET || '').trim();
  const authBaseUrl = String(
    process.env.DOCUSIGN_AUTH_BASE_URL || 'https://account-d.docusign.com',
  ).replace(/\/$/, '');
  const requestedScopes = String(process.env.DOCUSIGN_SCOPES || 'signature extended')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!clientId || !clientSecret) {
    throw new Error(
      'DocuSign OAuth is not configured. Missing DOCUSIGN_CLIENT_ID or DOCUSIGN_CLIENT_SECRET.',
    );
  }

  return {
    clientId,
    clientSecret,
    authBaseUrl,
    scopes: requestedScopes,
    redirectUri: `${getBaseUrl()}/api/integrations/docusign/oauth`,
  };
}

function getWebhookSecret() {
  return String(process.env.DOCUSIGN_WEBHOOK_SECRET || '').trim();
}

function getEncryptionKey(): Buffer {
  const raw = String(process.env.DOCUSIGN_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('DOCUSIGN_TOKEN_ENCRYPTION_KEY is required.');
  const key =
    raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DOCUSIGN_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
}

function encrypt(value: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const payload = Buffer.from(encrypted, 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const enc = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function integrationRef(tenantId: string) {
  return adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('integrations')
    .doc(DOCUSIGN_DOC_ID);
}

function envelopeRef(tenantId: string, envelopeId: string) {
  return adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('docusignEnvelopes')
    .doc(envelopeId);
}

export async function createDocusignOAuthState(params: {
  tenantId: string;
  userUid: string;
  returnTo: string;
}) {
  const state = crypto.randomBytes(24).toString('hex');
  const payload: OAuthStatePayload = {
    tenantId: params.tenantId,
    userUid: params.userUid,
    returnTo: params.returnTo,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await adminDb.collection(DOCUSIGN_STATE_COLLECTION).doc(state).set(payload);
  return state;
}

export async function consumeDocusignOAuthState(state: string) {
  const ref = adminDb.collection(DOCUSIGN_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Invalid OAuth state.');

  const data = snap.data() as { tenantId?: string; userUid?: string; returnTo?: string };
  await ref.delete().catch(() => undefined);

  if (!data?.tenantId || !data?.userUid) throw new Error('Malformed OAuth state.');

  return {
    tenantId: data.tenantId,
    userUid: data.userUid,
    returnTo: data.returnTo || '/admin/settings/integrations/docusign',
  };
}

export function buildDocusignAuthorizeUrl(state: string) {
  const cfg = getOAuthConfig();
  const url = new URL(`${cfg.authBaseUrl}/oauth/auth`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scopes.join(' '));
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const cfg = getOAuthConfig();
  const response = await fetch(`${cfg.authBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
    }).toString(),
  });

  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'DocuSign token exchange failed.');
  }
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const cfg = getOAuthConfig();
  const response = await fetch(`${cfg.authBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'DocuSign token refresh failed.');
  }

  return data;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const response = await fetch('https://account-d.docusign.com/oauth/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as UserInfoResponse;
  if (!response.ok) throw new Error('Unable to fetch DocuSign account information.');
  return data;
}

export async function saveDocusignConnection(params: {
  tenantId: string;
  userUid: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
  accountId: string;
  accountName: string | null;
  baseUri: string;
}) {
  const expiresAt = new Date(Date.now() + Math.max(60, params.expiresIn - 60) * 1000).toISOString();

  const payload: DocusignConnection = {
    connected: true,
    accountId: params.accountId,
    accountName: params.accountName,
    baseUri: params.baseUri,
    scopes: params.scopes,
    accessTokenEncrypted: encrypt(params.accessToken),
    refreshTokenEncrypted: params.refreshToken ? encrypt(params.refreshToken) : null,
    accessTokenExpiresAt: expiresAt,
    updatedBy: params.userUid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await integrationRef(params.tenantId).set(payload, { merge: true });
}

export async function connectDocusignFromCode(params: {
  tenantId: string;
  userUid: string;
  code: string;
}) {
  const token = await exchangeCode(params.code);
  const userInfo = await fetchUserInfo(token.access_token);
  const account = userInfo.accounts?.find((entry) => entry.is_default) || userInfo.accounts?.[0];
  if (!account?.account_id || !account?.base_uri) {
    throw new Error('DocuSign account ID association failed: no account available.');
  }

  const scopes = getOAuthConfig().scopes;
  await saveDocusignConnection({
    tenantId: params.tenantId,
    userUid: params.userUid,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresIn: token.expires_in,
    scopes,
    accountId: account.account_id,
    accountName: account.account_name || null,
    baseUri: account.base_uri,
  });
}

export async function getDocusignConnection(tenantId: string): Promise<DocusignConnection> {
  const snap = await integrationRef(tenantId).get();
  const data = snap.data() as Partial<DocusignConnection> | undefined;
  return {
    connected: Boolean(data?.connected),
    accountId: data?.accountId || null,
    accountName: data?.accountName || null,
    baseUri: data?.baseUri || null,
    scopes: Array.isArray(data?.scopes) ? data!.scopes! : [],
    accessTokenEncrypted: data?.accessTokenEncrypted || null,
    refreshTokenEncrypted: data?.refreshTokenEncrypted || null,
    accessTokenExpiresAt: data?.accessTokenExpiresAt || null,
  };
}

async function getAuthorizedConnection(
  tenantId: string,
): Promise<{ accessToken: string; connection: DocusignConnection }> {
  const connection = await getDocusignConnection(tenantId);
  if (
    !connection.connected ||
    !connection.accountId ||
    !connection.baseUri ||
    !connection.accessTokenEncrypted
  ) {
    throw new Error('DocuSign is not connected for this tenant.');
  }

  const now = Date.now();
  const expiresAt = connection.accessTokenExpiresAt
    ? new Date(connection.accessTokenExpiresAt).getTime()
    : 0;

  if (expiresAt > now + 30_000) {
    return { accessToken: decrypt(connection.accessTokenEncrypted), connection };
  }

  if (!connection.refreshTokenEncrypted) {
    throw new Error('DocuSign refresh token is missing. Reconnect DocuSign.');
  }

  const refreshed = await refreshAccessToken(decrypt(connection.refreshTokenEncrypted));
  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token
    ? encrypt(refreshed.refresh_token)
    : connection.refreshTokenEncrypted;
  const nextExpiresAt = new Date(
    Date.now() + Math.max(60, refreshed.expires_in - 60) * 1000,
  ).toISOString();

  await integrationRef(tenantId).set(
    {
      accessTokenEncrypted: encrypt(accessToken),
      refreshTokenEncrypted: refreshToken,
      accessTokenExpiresAt: nextExpiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    accessToken,
    connection: {
      ...connection,
      refreshTokenEncrypted:
        typeof refreshToken === 'string' ? refreshToken : connection.refreshTokenEncrypted,
      accessTokenExpiresAt: nextExpiresAt,
    },
  };
}

async function docusignRequest<T>(params: {
  tenantId: string;
  method?: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  rawResponse?: boolean;
}): Promise<T> {
  const { accessToken, connection } = await getAuthorizedConnection(params.tenantId);
  const response = await fetch(
    `${connection.baseUri}/restapi/v2.1/accounts/${connection.accountId}${params.path}`,
    {
      method: params.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(params.headers || {}),
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
      cache: 'no-store',
    },
  );

  if (params.rawResponse) return response as unknown as T;

  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    errorCode?: string;
  };
  if (!response.ok) {
    throw new Error(data?.message || data?.errorCode || 'DocuSign API request failed.');
  }
  return data;
}

export async function sendDocumentForSignature(params: {
  tenantId: string;
  userUid: string;
  userEmail: string;
  fileName: string;
  fileBytes: Buffer;
  signerEmails: string[];
  subject: string;
  message: string;
}) {
  if (!params.signerEmails.length) {
    throw new Error('At least one signer email is required.');
  }

  const envelope = await docusignRequest<{ envelopeId: string; status: string }>({
    tenantId: params.tenantId,
    method: 'POST',
    path: '/envelopes',
    body: {
      emailSubject: params.subject,
      emailBlurb: params.message,
      status: 'sent',
      documents: [
        {
          documentId: '1',
          name: params.fileName,
          fileExtension: 'pdf',
          documentBase64: params.fileBytes.toString('base64'),
        },
      ],
      recipients: {
        signers: params.signerEmails.map((email, index) => ({
          email,
          name: email,
          recipientId: String(index + 1),
          routingOrder: String(index + 1),
          tabs: {
            signHereTabs: [
              {
                anchorString: '/sn1/',
                anchorUnits: 'pixels',
                anchorXOffset: '20',
                anchorYOffset: '10',
              },
            ],
          },
        })),
      },
    },
  });

  const now = new Date().toISOString();
  const record: DocusignEnvelopeRecord = {
    tenantId: params.tenantId,
    envelopeId: envelope.envelopeId,
    status: envelope.status || 'sent',
    subject: params.subject,
    message: params.message,
    signerEmails: params.signerEmails,
    sourceFileName: params.fileName,
    docusignDocumentId: '1',
    createdBy: params.userUid,
    createdByEmail: params.userEmail,
    sentAt: now,
    completedAt: null,
    signedStoragePath: null,
    signedDocumentFileName: null,
    signedDocumentSize: null,
    signedDocumentDownloadedAt: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await envelopeRef(params.tenantId, envelope.envelopeId).set(record, { merge: true });

  return { envelopeId: envelope.envelopeId, status: envelope.status || 'sent' };
}

export async function getEnvelopeStatus(tenantId: string, envelopeId: string) {
  const envelope = await docusignRequest<{ status: string; completedDateTime?: string }>({
    tenantId,
    path: `/envelopes/${envelopeId}`,
  });

  const ref = envelopeRef(tenantId, envelopeId);
  await ref.set(
    {
      status: envelope.status,
      completedAt: envelope.completedDateTime || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const snap = await ref.get();
  const record = (snap.data() || {}) as Partial<DocusignEnvelopeRecord>;

  let downloadUrl: string | null = null;
  if (record.signedStoragePath) {
    const bucketName = getStorageBucketName();
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
    const file = bucket.file(record.signedStoragePath);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    downloadUrl = signedUrl;
  }

  return {
    envelopeId,
    status: envelope.status,
    completedAt: envelope.completedDateTime || null,
    signerEmails: record.signerEmails || [],
    sourceFileName: record.sourceFileName || null,
    signedDocumentFileName: record.signedDocumentFileName || null,
    signedDocumentDownloadedAt: record.signedDocumentDownloadedAt || null,
    downloadUrl,
  };
}

export async function downloadCompletedDocument(params: { tenantId: string; envelopeId: string }) {
  const ref = envelopeRef(params.tenantId, params.envelopeId);
  const existing = await ref.get();
  if (!existing.exists) throw new Error('Envelope not found for tenant.');

  const response = await docusignRequest<Response>({
    tenantId: params.tenantId,
    path: `/envelopes/${params.envelopeId}/documents/combined`,
    headers: { Accept: 'application/pdf' },
    rawResponse: true,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || 'Unable to download signed document from DocuSign.');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `${params.envelopeId}-signed.pdf`;
  const storagePath = `tenants/${params.tenantId}/docusign/${fileName}`;

  const bucketName = getStorageBucketName();
  const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
  await bucket.file(storagePath).save(bytes, {
    metadata: {
      contentType: 'application/pdf',
      metadata: {
        envelopeId: params.envelopeId,
        tenantId: params.tenantId,
      },
    },
  });

  const now = new Date().toISOString();
  await ref.set(
    {
      signedStoragePath: storagePath,
      signedDocumentFileName: fileName,
      signedDocumentSize: bytes.length,
      signedDocumentDownloadedAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { storagePath, fileName };
}

export async function remindSigners(params: {
  tenantId: string;
  envelopeId: string;
  signerEmails: string[];
}) {
  if (!params.signerEmails.length) throw new Error('No signer emails provided for reminder.');

  await docusignRequest({
    tenantId: params.tenantId,
    method: 'PUT',
    path: `/envelopes/${params.envelopeId}/recipients?resend_envelope=true`,
    body: {
      signers: params.signerEmails.map((email, index) => ({
        email,
        name: email,
        recipientId: String(index + 1),
      })),
    },
  });

  await envelopeRef(params.tenantId, params.envelopeId).set(
    {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export function verifyDocusignWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = getWebhookSecret();
  // Webhook authentication must fail closed. Treating an absent secret as
  // authenticated allowed anyone to submit a tenant id and mutate envelope
  // state in environments where DocuSign had not been fully configured.
  if (!secret) return false;
  if (!signatureHeader) return false;

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const actual = Buffer.from(signatureHeader);
  const expected = Buffer.from(digest);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export async function upsertEnvelopeStatusFromWebhook(payload: {
  envelopeId: string;
  status: string;
  completedAt?: string | null;
  tenantId?: string | null;
}) {
  // Resolve the tenant from the envelope record created by Bizosto. The
  // signed provider payload is an event notification, not authorization to
  // choose an arbitrary tenant document.
  const query = await adminDb
    .collectionGroup('docusignEnvelopes')
    .where('envelopeId', '==', payload.envelopeId)
    .limit(2)
    .get();
  if (query.empty) throw new Error('Envelope not found for webhook update.');
  if (query.docs.length !== 1) throw new Error('Envelope tenant binding is ambiguous.');

  const doc = query.docs[0];
  const record = doc.data() as Partial<DocusignEnvelopeRecord>;
  const tenantId = String(record.tenantId || '').trim();
  if (!tenantId) throw new Error('Envelope is missing its tenant binding.');
  if (payload.tenantId && String(payload.tenantId).trim() !== tenantId) {
    throw new Error('Envelope tenant binding mismatch.');
  }

  await doc.ref.set(
    {
      status: payload.status,
      completedAt: payload.completedAt || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (payload.status.toLowerCase() === 'completed' && !record.signedStoragePath) {
    await downloadCompletedDocument({ tenantId, envelopeId: payload.envelopeId });
  }
}

export async function getDocusignEnvelopes(tenantId: string, limitCount = 20) {
  const snap = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('docusignEnvelopes')
    .orderBy('updatedAt', 'desc')
    .limit(Math.min(Math.max(limitCount, 1), 100))
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as DocusignEnvelopeRecord;
    return {
      envelopeId: data.envelopeId || doc.id,
      status: data.status || 'unknown',
      subject: data.subject || '',
      signerEmails: Array.isArray(data.signerEmails) ? data.signerEmails : [],
      sentAt: data.sentAt || null,
      completedAt: data.completedAt || null,
      signedDocumentFileName: data.signedDocumentFileName || null,
      signedDocumentDownloadedAt: data.signedDocumentDownloadedAt || null,
    };
  });
}
