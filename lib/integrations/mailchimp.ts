import crypto from 'crypto';
import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Customer } from '@/types/crm';

const MAILCHIMP_DOC_ID = 'mailchimp';
const MAILCHIMP_STATE_COLLECTION = 'mailchimpOAuthStates';

type MailchimpAudience = {
  id: string;
  name: string;
  memberCount: number;
};

export type MailchimpSyncMode = 'one_time' | 'segment' | 'auto';

export type MailchimpSyncSettings = {
  autoSyncEnabled: boolean;
  defaultAudienceId: string | null;
  tagMapping: Record<string, string[]>;
};

export type MailchimpIntegrationConfig = {
  tenantId: string;
  connected: boolean;
  accountName: string | null;
  accountEmail: string | null;
  dc: string | null;
  scopes: string[];
  accessTokenEncrypted: string | null;
  apiKeyEncrypted: string | null;
  settings: MailchimpSyncSettings;
  stats: {
    lastSyncStartedAt: string | null;
    lastSyncFinishedAt: string | null;
    lastSyncMode: MailchimpSyncMode | null;
    lastSyncStatus: 'idle' | 'running' | 'success' | 'error';
    lastSyncError: string | null;
    lastSyncedCount: number;
    lastUnsubscribedCount: number;
  };
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

type MailchimpOauthTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type MailchimpMetadataResponse = {
  dc?: string;
  accountname?: string;
  login?: { email?: string };
};

type MailchimpMemberStatus =
  | 'subscribed'
  | 'unsubscribed'
  | 'cleaned'
  | 'pending'
  | 'transactional'
  | 'archived';

export type MailchimpSyncFilter = {
  type?: string;
  status?: string;
  tags?: string[];
};

export type MailchimpSyncResult = {
  synced: number;
  unsubscribed: number;
  skipped: number;
  audienceId: string;
  startedAt: string;
  finishedAt: string;
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

function getEncryptionKey(): Buffer {
  const raw = String(process.env.MAILCHIMP_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('MAILCHIMP_TOKEN_ENCRYPTION_KEY is required.');
  const key =
    raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MAILCHIMP_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
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

function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, '_').slice(0, 100);
}

function defaultSettings(): MailchimpSyncSettings {
  return {
    autoSyncEnabled: false,
    defaultAudienceId: null,
    tagMapping: {},
  };
}

function defaultStats() {
  return {
    lastSyncStartedAt: null,
    lastSyncFinishedAt: null,
    lastSyncMode: null,
    lastSyncStatus: 'idle' as const,
    lastSyncError: null,
    lastSyncedCount: 0,
    lastUnsubscribedCount: 0,
  };
}

function getIntegrationRef(tenantId: string) {
  return adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('integrations')
    .doc(MAILCHIMP_DOC_ID);
}

async function getCredentials(tenantId: string) {
  const cfg = await getMailchimpIntegration(tenantId);
  if (!cfg?.connected || !cfg.dc) throw new Error('Mailchimp is not connected.');

  const accessToken = cfg.accessTokenEncrypted ? decrypt(cfg.accessTokenEncrypted) : null;
  const apiKey = cfg.apiKeyEncrypted ? decrypt(cfg.apiKeyEncrypted) : null;
  if (!accessToken && !apiKey) throw new Error('No Mailchimp credential is configured.');

  return {
    dc: cfg.dc,
    oauthAccessToken: accessToken,
    apiKey,
    config: cfg,
  };
}

function mailchimpHeaders(credentials: { oauthAccessToken: string | null; apiKey: string | null }) {
  if (credentials.oauthAccessToken) {
    return {
      Authorization: `OAuth ${credentials.oauthAccessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
  if (!credentials.apiKey) throw new Error('No Mailchimp credential available.');
  const auth = Buffer.from(`anystring:${credentials.apiKey}`).toString('base64');
  return {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function mailchimpRequest<T>(
  credentials: { dc: string; oauthAccessToken: string | null; apiKey: string | null },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://${credentials.dc}.api.mailchimp.com/3.0${path}`, {
    ...init,
    headers: {
      ...mailchimpHeaders(credentials),
      ...(init?.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & { detail?: string; title?: string };
  if (!response.ok) throw new Error(data?.detail || data?.title || 'Mailchimp API request failed.');
  return data;
}

export function getMailchimpOAuthConfig() {
  const clientId = String(process.env.MAILCHIMP_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MAILCHIMP_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret)
    throw new Error('MAILCHIMP_CLIENT_ID and MAILCHIMP_CLIENT_SECRET are required.');

  return {
    clientId,
    clientSecret,
    redirectUri: `${getBaseUrl()}/api/integrations/mailchimp/oauth`,
    authorizeUrl: 'https://login.mailchimp.com/oauth2/authorize',
    tokenUrl: 'https://login.mailchimp.com/oauth2/token',
    metadataUrl: 'https://login.mailchimp.com/oauth2/metadata',
    scopes: [''],
  };
}

export async function createMailchimpOAuthState(params: {
  tenantId: string;
  userUid: string;
  returnTo?: string;
}) {
  const state = crypto.randomBytes(24).toString('base64url');
  await adminDb
    .collection(MAILCHIMP_STATE_COLLECTION)
    .doc(state)
    .set({
      state,
      tenantId: params.tenantId,
      userUid: params.userUid,
      returnTo: params.returnTo || '/admin/settings/integrations/mailchimp',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60_000),
    });
  return state;
}

export async function consumeMailchimpOAuthState(state: string) {
  const ref = adminDb.collection(MAILCHIMP_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Invalid Mailchimp OAuth state.');
  const data = snap.data() as {
    expiresAt?: Timestamp;
    tenantId: string;
    userUid: string;
    returnTo: string;
  };
  if (!data?.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error('Mailchimp OAuth state expired.');
  }
  await ref.delete();
  return data;
}

export function buildMailchimpAuthorizeUrl(state: string) {
  const cfg = getMailchimpOAuthConfig();
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeMailchimpCodeForAccessToken(code: string) {
  const cfg = getMailchimpOAuthConfig();
  const response = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      code,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as MailchimpOauthTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Mailchimp OAuth exchange failed.');
  }

  return {
    accessToken: data.access_token,
    scopes: String(data.scope || '')
      .split(' ')
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

export async function fetchMailchimpMetadata(accessToken: string) {
  const cfg = getMailchimpOAuthConfig();
  const response = await fetch(cfg.metadataUrl, {
    headers: {
      Authorization: `OAuth ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const data = (await response.json().catch(() => ({}))) as MailchimpMetadataResponse & {
    detail?: string;
  };
  if (!response.ok || !data.dc)
    throw new Error(data.detail || 'Unable to fetch Mailchimp account metadata.');

  return {
    dc: data.dc,
    accountName: data.accountname || null,
    accountEmail: data.login?.email || null,
  };
}

export async function saveMailchimpConnection(params: {
  tenantId: string;
  userUid: string;
  dc: string;
  accountName: string | null;
  accountEmail: string | null;
  scopes: string[];
  accessToken?: string;
  apiKey?: string;
}) {
  const existing = await getMailchimpIntegration(params.tenantId);
  await getIntegrationRef(params.tenantId).set(
    {
      tenantId: params.tenantId,
      connected: true,
      dc: params.dc,
      accountName: params.accountName,
      accountEmail: params.accountEmail,
      scopes: params.scopes,
      accessTokenEncrypted: params.accessToken
        ? encrypt(params.accessToken)
        : existing?.accessTokenEncrypted || null,
      apiKeyEncrypted: params.apiKey ? encrypt(params.apiKey) : existing?.apiKeyEncrypted || null,
      settings: existing?.settings || defaultSettings(),
      stats: existing?.stats || defaultStats(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    } satisfies MailchimpIntegrationConfig,
    { merge: true },
  );
}

export async function saveMailchimpApiKey(params: {
  tenantId: string;
  userUid: string;
  apiKey: string;
}) {
  const key = params.apiKey.trim();
  if (!key || !key.includes('-')) throw new Error('Invalid Mailchimp API key format.');
  const dc = key.split('-').at(-1)?.trim();
  if (!dc) throw new Error('Unable to determine Mailchimp data center from API key.');

  const existing = await getMailchimpIntegration(params.tenantId);
  await getIntegrationRef(params.tenantId).set(
    {
      tenantId: params.tenantId,
      connected: true,
      dc,
      accountName: existing?.accountName || 'API Key Connection',
      accountEmail: existing?.accountEmail || null,
      scopes: existing?.scopes || [],
      accessTokenEncrypted: existing?.accessTokenEncrypted || null,
      apiKeyEncrypted: encrypt(key),
      settings: existing?.settings || defaultSettings(),
      stats: existing?.stats || defaultStats(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    } satisfies MailchimpIntegrationConfig,
    { merge: true },
  );
}

export async function getMailchimpIntegration(
  tenantId: string,
): Promise<MailchimpIntegrationConfig | null> {
  const snap = await getIntegrationRef(tenantId).get();
  if (!snap.exists) return null;
  return snap.data() as MailchimpIntegrationConfig;
}

export async function updateMailchimpSettings(
  tenantId: string,
  userUid: string,
  patch: Partial<MailchimpSyncSettings> & { defaultAudienceId?: string | null },
) {
  const existing = await getMailchimpIntegration(tenantId);
  const current = existing?.settings || defaultSettings();
  const tagMapping = patch.tagMapping
    ? Object.fromEntries(
        Object.entries(patch.tagMapping).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.map((item) => normalizeTag(String(item))).filter(Boolean)
            : [],
        ]),
      )
    : current.tagMapping;

  const next: MailchimpSyncSettings = {
    autoSyncEnabled:
      typeof patch.autoSyncEnabled === 'boolean' ? patch.autoSyncEnabled : current.autoSyncEnabled,
    defaultAudienceId:
      patch.defaultAudienceId === undefined
        ? current.defaultAudienceId
        : patch.defaultAudienceId
          ? String(patch.defaultAudienceId)
          : null,
    tagMapping,
  };

  await getIntegrationRef(tenantId).set(
    {
      tenantId,
      settings: next,
      connected: existing?.connected || false,
      stats: existing?.stats || defaultStats(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userUid,
    },
    { merge: true },
  );
}

export async function listMailchimpAudiences(tenantId: string): Promise<MailchimpAudience[]> {
  const credentials = await getCredentials(tenantId);
  const data = await mailchimpRequest<{
    lists?: Array<{ id: string; name: string; stats?: { member_count?: number } }>;
  }>(credentials, '/lists?count=200');

  return (data.lists || []).map((item) => ({
    id: item.id,
    name: item.name,
    memberCount: Number(item.stats?.member_count || 0),
  }));
}

async function getMailchimpMemberStatus(
  credentials: { dc: string; oauthAccessToken: string | null; apiKey: string | null },
  audienceId: string,
  email: string,
): Promise<MailchimpMemberStatus | null> {
  const hash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
  const response = await fetch(
    `https://${credentials.dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${hash}`,
    {
      headers: mailchimpHeaders(credentials),
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { detail?: string; title?: string };
    throw new Error(err.detail || err.title || 'Unable to read Mailchimp member state.');
  }

  const data = (await response.json()) as { status?: MailchimpMemberStatus };
  return data.status || null;
}

function buildTags(customer: Customer, mapping: Record<string, string[]>): string[] {
  const sourceTags = new Set<string>();
  sourceTags.add(`client_type:${customer.type}`);
  if (customer.industry) sourceTags.add(`industry:${customer.industry}`);
  if (customer.leadSource) sourceTags.add(`lead_source:${customer.leadSource}`);
  for (const tag of customer.tags || []) sourceTags.add(tag);

  const mapped = new Set<string>();
  for (const source of sourceTags) {
    const normalizedSource = normalizeTag(source);
    mapped.add(normalizedSource);
    for (const mappedTag of mapping[source] || []) {
      const normalized = normalizeTag(mappedTag);
      if (normalized) mapped.add(normalized);
    }
  }

  return Array.from(mapped).slice(0, 50);
}

async function upsertMailchimpMember(params: {
  tenantId: string;
  audienceId: string;
  customer: Customer;
  tagMapping: Record<string, string[]>;
}) {
  const credentials = await getCredentials(params.tenantId);
  const email = params.customer.email.toLowerCase();
  const hash = crypto.createHash('md5').update(email).digest('hex');
  const previousStatus = await getMailchimpMemberStatus(credentials, params.audienceId, email);

  const forceUnsubscribe =
    !params.customer.emailOptIn ||
    Boolean(params.customer.unsubscribedAt) ||
    previousStatus === 'unsubscribed' ||
    previousStatus === 'cleaned' ||
    previousStatus === 'archived';

  await mailchimpRequest(credentials, `/lists/${params.audienceId}/members/${hash}`, {
    method: 'PUT',
    body: JSON.stringify({
      email_address: email,
      status_if_new: forceUnsubscribe ? 'unsubscribed' : 'subscribed',
      status: forceUnsubscribe
        ? 'unsubscribed'
        : previousStatus === 'pending'
          ? 'pending'
          : 'subscribed',
      merge_fields: {
        FNAME: params.customer.firstName || '',
        LNAME: params.customer.lastName || '',
        COMPANY: params.customer.companyName || '',
        PHONE: params.customer.phone || '',
      },
    }),
  });

  const tags = buildTags(params.customer, params.tagMapping);
  if (tags.length) {
    await mailchimpRequest(credentials, `/lists/${params.audienceId}/members/${hash}/tags`, {
      method: 'POST',
      body: JSON.stringify({
        tags: tags.map((tag) => ({ name: tag, status: 'active' })),
      }),
    });
  }

  return { unsubscribed: forceUnsubscribe };
}

function customerMatchesFilter(customer: Customer, filter?: MailchimpSyncFilter): boolean {
  if (!filter) return true;
  if (filter.type && customer.type !== filter.type) return false;
  if (filter.status && customer.status !== filter.status) return false;
  if (filter.tags?.length) {
    const tags = new Set(customer.tags || []);
    for (const tag of filter.tags) {
      if (!tags.has(tag)) return false;
    }
  }
  return true;
}

async function loadCustomersForSync(tenantId: string) {
  const snap = await adminDb
    .collection('customers')
    .where('tenantId', '==', tenantId)
    .limit(1000)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Customer, 'id'>) }));
}

export async function syncCustomersToAudience(params: {
  tenantId: string;
  userUid: string;
  audienceId?: string;
  mode: MailchimpSyncMode;
  filter?: MailchimpSyncFilter;
}) {
  const config = await getMailchimpIntegration(params.tenantId);
  const startedAt = new Date().toISOString();
  await getIntegrationRef(params.tenantId).set(
    {
      stats: {
        ...(config?.stats || defaultStats()),
        lastSyncStartedAt: startedAt,
        lastSyncStatus: 'running',
        lastSyncError: null,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    },
    { merge: true },
  );

  try {
    if (!config?.connected) throw new Error('Mailchimp integration is not connected.');
    const audienceId = params.audienceId || config.settings.defaultAudienceId;
    if (!audienceId)
      throw new Error('Audience is required. Select a default audience or pass audienceId.');

    const customers = await loadCustomersForSync(params.tenantId);
    let synced = 0;
    let unsubscribed = 0;
    let skipped = 0;

    for (const customer of customers) {
      if (!customer.email || !customerMatchesFilter(customer, params.filter)) {
        skipped += 1;
        continue;
      }
      const result = await upsertMailchimpMember({
        tenantId: params.tenantId,
        audienceId,
        customer,
        tagMapping: config.settings.tagMapping,
      });
      synced += 1;
      if (result.unsubscribed) unsubscribed += 1;
    }

    const finishedAt = new Date().toISOString();
    const result: MailchimpSyncResult = {
      synced,
      unsubscribed,
      skipped,
      audienceId,
      startedAt,
      finishedAt,
    };

    await getIntegrationRef(params.tenantId).set(
      {
        stats: {
          ...(config.stats || defaultStats()),
          lastSyncStartedAt: startedAt,
          lastSyncFinishedAt: finishedAt,
          lastSyncMode: params.mode,
          lastSyncStatus: 'success',
          lastSyncError: null,
          lastSyncedCount: synced,
          lastUnsubscribedCount: unsubscribed,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: params.userUid,
      },
      { merge: true },
    );

    await adminDb
      .collection('tenants')
      .doc(params.tenantId)
      .collection('mailchimpSyncLogs')
      .add({
        tenantId: params.tenantId,
        mode: params.mode,
        filter: params.filter || null,
        ...result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: params.userUid,
      });

    return result;
  } catch (error: any) {
    await getIntegrationRef(params.tenantId).set(
      {
        stats: {
          ...(config?.stats || defaultStats()),
          lastSyncStartedAt: startedAt,
          lastSyncFinishedAt: new Date().toISOString(),
          lastSyncMode: params.mode,
          lastSyncStatus: 'error',
          lastSyncError: error?.message || 'Mailchimp sync failed.',
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: params.userUid,
      },
      { merge: true },
    );
    throw error;
  }
}

export async function subscribeSingleContact(params: {
  tenantId: string;
  audienceId?: string;
  customer: Pick<
    Customer,
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'companyName'
    | 'phone'
    | 'type'
    | 'tags'
    | 'industry'
    | 'leadSource'
    | 'emailOptIn'
    | 'unsubscribedAt'
  >;
}) {
  const config = await getMailchimpIntegration(params.tenantId);
  if (!config?.connected) throw new Error('Mailchimp integration is not connected.');

  const audienceId = params.audienceId || config.settings.defaultAudienceId;
  if (!audienceId) throw new Error('Audience is required.');

  const customer = {
    ...params.customer,
    tenantId: params.tenantId,
    status: 'new',
    priority: 'medium',
    ownerId: '',
    ownerName: '',
    fullName: `${params.customer.firstName} ${params.customer.lastName}`.trim(),
    leadScore: 0,
    totalDeals: 0,
    totalRevenue: 0,
    openDeals: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    doNotCall: false,
    firstName: params.customer.firstName,
    lastName: params.customer.lastName,
    email: params.customer.email,
    type: params.customer.type,
    tags: params.customer.tags,
    companyName: params.customer.companyName,
    phone: params.customer.phone,
    industry: params.customer.industry,
    leadSource: params.customer.leadSource,
    emailOptIn: params.customer.emailOptIn,
    unsubscribedAt: params.customer.unsubscribedAt,
    stage: 'new',
    stageName: 'New',
  } as Customer;

  return upsertMailchimpMember({
    tenantId: params.tenantId,
    audienceId,
    customer,
    tagMapping: config.settings.tagMapping,
  });
}

export async function autoSyncCustomerIfEnabled(params: {
  tenantId: string;
  userUid: string;
  customerId: string;
}) {
  const config = await getMailchimpIntegration(params.tenantId);
  if (!config?.connected || !config.settings.autoSyncEnabled || !config.settings.defaultAudienceId)
    return;

  const snap = await adminDb.collection('customers').doc(params.customerId).get();
  if (!snap.exists) return;
  const customer = snap.data() as Customer;
  if (customer.tenantId !== params.tenantId || !customer.email) return;

  await upsertMailchimpMember({
    tenantId: params.tenantId,
    audienceId: config.settings.defaultAudienceId,
    customer,
    tagMapping: config.settings.tagMapping,
  });
}
