import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant";

const QUICKBOOKS_DOC_ID = "quickbooks";
const QUICKBOOKS_STATE_COLLECTION = "quickbooksOAuthStates";
const QUICKBOOKS_LOGS_COLLECTION = "quickbooksSyncLogs";
const QUICKBOOKS_MAX_PAGE = 100;

export type QuickBooksConflictMode = "last_write_wins" | "manual";

export type QuickBooksSyncSettings = {
  syncInvoicesToQuickBooks: boolean;
  syncPaymentsFromQuickBooks: boolean;
  syncCustomersTwoWay: boolean;
  syncAccounts: boolean;
  syncTaxRates: boolean;
  scheduleDaily: boolean;
  conflictMode: QuickBooksConflictMode;
};

export type QuickBooksIntegrationConfig = {
  tenantId: string;
  connected: boolean;
  companyId: string | null;
  companyName: string | null;
  scopes: string[];
  tokensEncrypted: string | null;
  settings: QuickBooksSyncSettings;
  cursor: {
    fullSyncCompletedAt: string | null;
    invoicesLastSyncAt: string | null;
    paymentsLastSyncAt: string | null;
    customersLastSyncAt: string | null;
    accountsLastSyncAt: string | null;
    taxRatesLastSyncAt: string | null;
  };
  stats: {
    lastSyncStartedAt: string | null;
    lastSyncFinishedAt: string | null;
    lastSyncStatus: "idle" | "running" | "success" | "error";
    lastSyncError: string | null;
  };
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

type QuickBooksTokenPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
};

type OAuthTokenExchangeResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
};

type SyncEntityResult = {
  inserted: number;
  updated: number;
  skipped: number;
};

export type QuickBooksSyncRunResult = {
  mode: "initial" | "incremental";
  invoices: SyncEntityResult;
  payments: SyncEntityResult;
  customers: SyncEntityResult;
  accounts: SyncEntityResult;
  taxRates: SyncEntityResult;
  conflicts: number;
  startedAt: string;
  finishedAt: string;
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function getEncryptionKey(): Buffer {
  const raw = String(process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("QUICKBOOKS_TOKEN_ENCRYPTION_KEY is required.");
  }
  const key = raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("QUICKBOOKS_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return key;
}

function encryptJson(payload: unknown): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptJson<T>(encrypted: string): T {
  const key = getEncryptionKey();
  const source = Buffer.from(encrypted, "base64");
  const iv = source.subarray(0, 12);
  const tag = source.subarray(12, 28);
  const payload = source.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

export function getQuickBooksOAuthConfig() {
  const clientId = String(process.env.QUICKBOOKS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.QUICKBOOKS_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET are required.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${getBaseUrl()}/api/integrations/quickbooks/callback`,
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    apiBaseUrl: process.env.QUICKBOOKS_API_BASE_URL || "https://quickbooks.api.intuit.com",
    scopes: ["com.intuit.quickbooks.accounting"],
  };
}

function defaultSettings(): QuickBooksSyncSettings {
  return {
    syncInvoicesToQuickBooks: true,
    syncPaymentsFromQuickBooks: true,
    syncCustomersTwoWay: true,
    syncAccounts: true,
    syncTaxRates: true,
    scheduleDaily: true,
    conflictMode: "last_write_wins",
  };
}

function defaultCursor() {
  return {
    fullSyncCompletedAt: null,
    invoicesLastSyncAt: null,
    paymentsLastSyncAt: null,
    customersLastSyncAt: null,
    accountsLastSyncAt: null,
    taxRatesLastSyncAt: null,
  };
}

function defaultStats() {
  return {
    lastSyncStartedAt: null,
    lastSyncFinishedAt: null,
    lastSyncStatus: "idle" as const,
    lastSyncError: null,
  };
}

export async function createQuickBooksOAuthState(params: { tenantId: string; userUid: string; returnTo?: string }) {
  const state = crypto.randomBytes(24).toString("base64url");
  await adminDb.collection(QUICKBOOKS_STATE_COLLECTION).doc(state).set({
    state,
    tenantId: normalizeTenantId(params.tenantId),
    userUid: params.userUid,
    returnTo: params.returnTo || "/admin/settings/integrations/quickbooks",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60_000),
  });
  return state;
}

export async function consumeQuickBooksOAuthState(state: string) {
  const ref = adminDb.collection(QUICKBOOKS_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invalid QuickBooks OAuth state.");
  const data = snap.data() as any;
  if (!data?.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error("QuickBooks OAuth state expired.");
  }
  await ref.delete();
  return data as { tenantId: string; userUid: string; returnTo: string };
}

export function buildQuickBooksAuthorizeUrl(state: string) {
  const cfg = getQuickBooksOAuthConfig();
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

function getTenantIntegrationRef(tenantId: string) {
  return adminDb.collection("tenants").doc(normalizeTenantId(tenantId)).collection("integrations").doc(QUICKBOOKS_DOC_ID);
}

export async function exchangeQuickBooksCodeForTokens(code: string): Promise<QuickBooksTokenPayload> {
  const cfg = getQuickBooksOAuthConfig();
  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");

  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OAuthTokenExchangeResponse & { error_description?: string; error?: string };
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || data.error || "QuickBooks OAuth exchange failed.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    refreshExpiresAt: Date.now() + Number(data.x_refresh_token_expires_in || 8_640_000) * 1000,
  };
}

export async function saveQuickBooksConnection(params: {
  tenantId: string;
  userUid: string;
  realmId: string;
  companyName: string | null;
  scopes: string[];
  tokenPayload: QuickBooksTokenPayload;
}) {
  await getTenantIntegrationRef(params.tenantId).set(
    {
      tenantId: normalizeTenantId(params.tenantId),
      connected: true,
      companyId: params.realmId,
      companyName: params.companyName,
      scopes: params.scopes,
      tokensEncrypted: encryptJson(params.tokenPayload),
      settings: defaultSettings(),
      cursor: defaultCursor(),
      stats: defaultStats(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    } satisfies QuickBooksIntegrationConfig,
    { merge: true }
  );
}

export async function getQuickBooksIntegration(tenantId: string): Promise<QuickBooksIntegrationConfig | null> {
  const snap = await getTenantIntegrationRef(tenantId).get();
  if (!snap.exists) return null;
  const value = snap.data() as QuickBooksIntegrationConfig;
  return {
    ...value,
    settings: { ...defaultSettings(), ...(value.settings || {}) },
    cursor: { ...defaultCursor(), ...(value.cursor || {}) },
    stats: { ...defaultStats(), ...(value.stats || {}) },
  };
}

async function refreshQuickBooksToken(current: QuickBooksTokenPayload): Promise<QuickBooksTokenPayload> {
  const cfg = getQuickBooksOAuthConfig();
  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");

  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OAuthTokenExchangeResponse & { error?: string; error_description?: string };
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || data.error || "QuickBooks token refresh failed.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    refreshExpiresAt: Date.now() + Number(data.x_refresh_token_expires_in || 8_640_000) * 1000,
  };
}

async function getAccessTokenAndCompany(tenantId: string) {
  const ref = getTenantIntegrationRef(tenantId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("QuickBooks is not connected for this tenant.");
  const config = snap.data() as QuickBooksIntegrationConfig;
  if (!config.connected || !config.tokensEncrypted || !config.companyId) {
    throw new Error("QuickBooks connection is incomplete.");
  }

  const tokenPayload = decryptJson<QuickBooksTokenPayload>(config.tokensEncrypted);
  if (tokenPayload.expiresAt > Date.now() + 60_000) {
    return { accessToken: tokenPayload.accessToken, companyId: config.companyId };
  }

  const refreshed = await refreshQuickBooksToken(tokenPayload);
  await ref.set(
    {
      tokensEncrypted: encryptJson(refreshed),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { accessToken: refreshed.accessToken, companyId: config.companyId };
}

type QuickBooksApiOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

export async function callQuickBooksApi<T>(tenantId: string, path: string, options: QuickBooksApiOptions = {}): Promise<T> {
  const cfg = getQuickBooksOAuthConfig();
  const { accessToken } = await getAccessTokenAndCompany(tenantId);
  const url = `${cfg.apiBaseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || data?.Fault) {
    const fault = data?.Fault?.Error?.[0];
    throw new Error(fault?.Detail || fault?.Message || `QuickBooks API request failed (${response.status})`);
  }
  return data as T;
}

async function queryQuickBooks(tenantId: string, query: string) {
  const { companyId } = await getAccessTokenAndCompany(tenantId);
  const encoded = encodeURIComponent(query);
  return callQuickBooksApi<any>(tenantId, `/v3/company/${companyId}/query?query=${encoded}&minorversion=75`);
}

async function postQuickBooksEntity(tenantId: string, entity: string, body: Record<string, unknown>) {
  const { companyId } = await getAccessTokenAndCompany(tenantId);
  return callQuickBooksApi<any>(tenantId, `/v3/company/${companyId}/${entity}?minorversion=75`, { method: "POST", body });
}

function getString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeIso(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapSyncEntityResult(): SyncEntityResult {
  return { inserted: 0, updated: 0, skipped: 0 };
}

function compareLocalVsRemote(localUpdatedAt: string | null, remoteUpdatedAt: string | null) {
  const localTs = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
  const remoteTs = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
  return localTs - remoteTs;
}

async function upsertCustomerFromQuickBooks(tenantId: string, qboCustomer: any, settings: QuickBooksSyncSettings) {
  const externalId = getString(qboCustomer?.Id);
  if (!externalId) return { op: "skip" as const, conflict: false };

  const query = await adminDb
    .collection("clients")
    .where("tenantId", "==", tenantId)
    .where("quickbooks.id", "==", externalId)
    .limit(1)
    .get();

  const remoteUpdatedAt = normalizeIso(qboCustomer?.MetaData?.LastUpdatedTime);
  const payload = {
    tenantId,
    companyName: getString(qboCustomer?.CompanyName || qboCustomer?.DisplayName) || "Unknown",
    primaryContactEmail: getString(qboCustomer?.PrimaryEmailAddr?.Address),
    primaryContactPhone: getString(qboCustomer?.PrimaryPhone?.FreeFormNumber),
    website: getString(qboCustomer?.WebAddr?.URI),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    quickbooks: {
      id: externalId,
      syncToken: getString(qboCustomer?.SyncToken),
      lastUpdatedAt: remoteUpdatedAt,
      displayName: getString(qboCustomer?.DisplayName),
    },
  };

  if (query.empty) {
    await adminDb.collection("clients").add({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { op: "insert" as const, conflict: false };
  }

  const doc = query.docs[0];
  const current = doc.data() as any;
  const localUpdatedAt = normalizeIso(current?.quickbooks?.lastUpdatedAt || current?.updatedAt?.toDate?.()?.toISOString?.());
  const localIsNewer = compareLocalVsRemote(localUpdatedAt, remoteUpdatedAt) > 0;
  if (settings.conflictMode === "manual" && localIsNewer) {
    return { op: "skip" as const, conflict: true };
  }

  await doc.ref.set(payload, { merge: true });
  return { op: "update" as const, conflict: false };
}

async function syncCustomersFromQuickBooks(tenantId: string, sinceISO: string | null, settings: QuickBooksSyncSettings) {
  const result = mapSyncEntityResult();
  let conflicts = 0;
  let query = "SELECT * FROM Customer MAXRESULTS 1000";
  if (sinceISO) {
    query = `SELECT * FROM Customer WHERE MetaData.LastUpdatedTime > '${sinceISO.replace(".000Z", "Z")}' MAXRESULTS 1000`;
  }

  const response = await queryQuickBooks(tenantId, query);
  const customers = response?.QueryResponse?.Customer || [];
  for (const customer of customers) {
    const op = await upsertCustomerFromQuickBooks(tenantId, customer, settings);
    if (op.op === "insert") result.inserted += 1;
    else if (op.op === "update") result.updated += 1;
    else result.skipped += 1;
    if (op.conflict) conflicts += 1;
  }

  return { result, conflicts };
}

async function syncCustomersToQuickBooks(tenantId: string, sinceISO: string | null) {
  const result = mapSyncEntityResult();
  let query = adminDb.collection("clients").where("tenantId", "==", tenantId).limit(QUICKBOOKS_MAX_PAGE);
  if (sinceISO) query = query.where("updatedAt", ">", admin.firestore.Timestamp.fromDate(new Date(sinceISO)) as any);
  const local = await query.get();

  for (const doc of local.docs) {
    const data = doc.data() as any;
    const qbId = getString(data?.quickbooks?.id);
    if (qbId) {
      result.skipped += 1;
      continue;
    }

    const body = {
      DisplayName: getString(data.companyName || data.primaryContactName || doc.id).slice(0, 100),
      CompanyName: getString(data.companyName || data.primaryContactName || "Customer"),
      PrimaryEmailAddr: data.primaryContactEmail ? { Address: getString(data.primaryContactEmail) } : undefined,
      PrimaryPhone: data.primaryContactPhone ? { FreeFormNumber: getString(data.primaryContactPhone) } : undefined,
      WebAddr: data.website ? { URI: getString(data.website) } : undefined,
    };

    const response = await postQuickBooksEntity(tenantId, "customer", body);
    const created = response?.Customer;
    if (!created?.Id) {
      result.skipped += 1;
      continue;
    }

    await doc.ref.set(
      {
        quickbooks: {
          id: getString(created.Id),
          syncToken: getString(created.SyncToken),
          lastUpdatedAt: normalizeIso(created?.MetaData?.LastUpdatedTime),
          displayName: getString(created?.DisplayName),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    result.updated += 1;
  }

  return result;
}

async function syncInvoicesToQuickBooks(tenantId: string, sinceISO: string | null) {
  const result = mapSyncEntityResult();
  let query = adminDb.collection("invoices").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(QUICKBOOKS_MAX_PAGE);
  if (sinceISO) query = query.where("updatedAt", ">", admin.firestore.Timestamp.fromDate(new Date(sinceISO)) as any);
  const invoices = await query.get();

  for (const doc of invoices.docs) {
    const invoice = doc.data() as any;
    if (getString(invoice?.quickbooks?.id)) {
      result.skipped += 1;
      continue;
    }

    const clientId = getString(invoice.clientId);
    const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
    const qbCustomerId = getString(clientSnap?.data()?.quickbooks?.id);
    if (!qbCustomerId) {
      result.skipped += 1;
      continue;
    }

    const amount = Number(invoice.amountTotal || invoice.totalUSD || 0);
    const body = {
      CustomerRef: { value: qbCustomerId },
      TxnDate: normalizeIso(invoice.issuedAt)?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      DueDate: normalizeIso(invoice.dueDate)?.slice(0, 10) || undefined,
      PrivateNote: getString(invoice.notes),
      Line: [
        {
          Amount: Number.isFinite(amount) ? amount : 0,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { value: "1", name: "Services" },
          },
          Description: getString(invoice.orderId || `Invoice ${doc.id}`),
        },
      ],
    };

    const response = await postQuickBooksEntity(tenantId, "invoice", body);
    const created = response?.Invoice;
    if (!created?.Id) {
      result.skipped += 1;
      continue;
    }

    await doc.ref.set(
      {
        quickbooks: {
          id: getString(created.Id),
          syncToken: getString(created.SyncToken),
          lastUpdatedAt: normalizeIso(created?.MetaData?.LastUpdatedTime),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    result.updated += 1;
  }

  return result;
}

async function syncPaymentsFromQuickBooks(tenantId: string, sinceISO: string | null, settings: QuickBooksSyncSettings) {
  const result = mapSyncEntityResult();
  let conflicts = 0;
  let qbQuery = "SELECT * FROM Payment MAXRESULTS 1000";
  if (sinceISO) qbQuery = `SELECT * FROM Payment WHERE MetaData.LastUpdatedTime > '${sinceISO.replace(".000Z", "Z")}' MAXRESULTS 1000`;
  const response = await queryQuickBooks(tenantId, qbQuery);
  const payments = response?.QueryResponse?.Payment || [];

  for (const payment of payments) {
    const qbId = getString(payment?.Id);
    if (!qbId) {
      result.skipped += 1;
      continue;
    }

    const existing = await adminDb
      .collection("payments")
      .where("tenantId", "==", tenantId)
      .where("quickbooks.id", "==", qbId)
      .limit(1)
      .get();

    const remoteUpdatedAt = normalizeIso(payment?.MetaData?.LastUpdatedTime);
    if (!existing.empty) {
      const current = existing.docs[0].data() as any;
      const localUpdatedAt = normalizeIso(current?.quickbooks?.lastUpdatedAt || current?.updatedAt?.toDate?.()?.toISOString?.());
      const localIsNewer = compareLocalVsRemote(localUpdatedAt, remoteUpdatedAt) > 0;
      if (settings.conflictMode === "manual" && localIsNewer) {
        conflicts += 1;
        result.skipped += 1;
        continue;
      }

      await existing.docs[0].ref.set(
        {
          amountUsd: Number(payment?.TotalAmt || 0),
          status: "completed",
          paidAt: payment?.TxnDate ? `${payment.TxnDate}T00:00:00.000Z` : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          quickbooks: {
            id: qbId,
            syncToken: getString(payment?.SyncToken),
            lastUpdatedAt: remoteUpdatedAt,
          },
        },
        { merge: true }
      );
      result.updated += 1;
      continue;
    }

    await adminDb.collection("payments").add({
      tenantId,
      clientId: "",
      clientName: getString(payment?.CustomerRef?.name),
      currency: getString(payment?.CurrencyRef?.value || "USD"),
      amountUsd: Number(payment?.TotalAmt || 0),
      method: getString(payment?.PaymentMethodRef?.name || "QuickBooks"),
      status: "completed",
      paidAt: payment?.TxnDate ? `${payment.TxnDate}T00:00:00.000Z` : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isDeleted: false,
      quickbooks: {
        id: qbId,
        syncToken: getString(payment?.SyncToken),
        lastUpdatedAt: remoteUpdatedAt,
      },
    });
    result.inserted += 1;
  }

  return { result, conflicts };
}

async function syncAccountsFromQuickBooks(tenantId: string, sinceISO: string | null) {
  const result = mapSyncEntityResult();
  let qbQuery = "SELECT * FROM Account MAXRESULTS 1000";
  if (sinceISO) qbQuery = `SELECT * FROM Account WHERE MetaData.LastUpdatedTime > '${sinceISO.replace(".000Z", "Z")}' MAXRESULTS 1000`;
  const response = await queryQuickBooks(tenantId, qbQuery);
  const accounts = response?.QueryResponse?.Account || [];

  for (const account of accounts) {
    const qbId = getString(account?.Id);
    if (!qbId) {
      result.skipped += 1;
      continue;
    }

    const existing = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("chartOfAccounts")
      .where("quickbooks.id", "==", qbId)
      .limit(1)
      .get();

    const data = {
      name: getString(account?.Name),
      accountType: getString(account?.AccountType),
      accountSubType: getString(account?.AccountSubType),
      active: Boolean(account?.Active !== false),
      classification: getString(account?.Classification),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      quickbooks: {
        id: qbId,
        syncToken: getString(account?.SyncToken),
        lastUpdatedAt: normalizeIso(account?.MetaData?.LastUpdatedTime),
      },
    };

    if (existing.empty) {
      await adminDb.collection("tenants").doc(tenantId).collection("chartOfAccounts").add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      result.inserted += 1;
    } else {
      await existing.docs[0].ref.set(data, { merge: true });
      result.updated += 1;
    }
  }

  return result;
}

async function syncTaxRatesFromQuickBooks(tenantId: string, sinceISO: string | null) {
  const result = mapSyncEntityResult();
  let qbQuery = "SELECT * FROM TaxRate MAXRESULTS 1000";
  if (sinceISO) qbQuery = `SELECT * FROM TaxRate WHERE MetaData.LastUpdatedTime > '${sinceISO.replace(".000Z", "Z")}' MAXRESULTS 1000`;
  const response = await queryQuickBooks(tenantId, qbQuery);
  const rates = response?.QueryResponse?.TaxRate || [];

  for (const rate of rates) {
    const qbId = getString(rate?.Id);
    if (!qbId) {
      result.skipped += 1;
      continue;
    }

    const existing = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("taxRates")
      .where("quickbooks.id", "==", qbId)
      .limit(1)
      .get();

    const data = {
      name: getString(rate?.Name),
      rate: Number(rate?.RateValue || 0),
      enabled: Boolean(rate?.Active !== false),
      type: "simple",
      applies_to: "subtotal",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      quickbooks: {
        id: qbId,
        syncToken: getString(rate?.SyncToken),
        lastUpdatedAt: normalizeIso(rate?.MetaData?.LastUpdatedTime),
      },
    };

    if (existing.empty) {
      await adminDb.collection("tenants").doc(tenantId).collection("taxRates").add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      result.inserted += 1;
    } else {
      await existing.docs[0].ref.set(data, { merge: true });
      result.updated += 1;
    }
  }

  return result;
}

export async function updateQuickBooksSettings(
  tenantId: string,
  userUid: string,
  patch: Partial<QuickBooksSyncSettings>
): Promise<QuickBooksSyncSettings> {
  const current = await getQuickBooksIntegration(tenantId);
  const merged = {
    ...(current?.settings || defaultSettings()),
    ...patch,
    conflictMode: patch.conflictMode === "manual" ? "manual" : patch.conflictMode === "last_write_wins" ? "last_write_wins" : (current?.settings?.conflictMode || "last_write_wins"),
  };

  await getTenantIntegrationRef(tenantId).set(
    {
      tenantId: normalizeTenantId(tenantId),
      settings: merged,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userUid,
    },
    { merge: true }
  );

  return merged;
}

export async function getQuickBooksSyncLogs(tenantId: string, limit = 50) {
  const capped = Math.min(Math.max(limit, 1), 200);
  const snapshot = await adminDb
    .collection("tenants")
    .doc(normalizeTenantId(tenantId))
    .collection(QUICKBOOKS_LOGS_COLLECTION)
    .orderBy("startedAt", "desc")
    .limit(capped)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function runQuickBooksSync(input: { tenantId: string; userUid: string; forceInitial?: boolean }) {
  const tenantId = normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
  const integration = await getQuickBooksIntegration(tenantId);
  if (!integration?.connected) {
    throw new Error("QuickBooks is not connected.");
  }

  const mode: "initial" | "incremental" = input.forceInitial || !integration.cursor?.fullSyncCompletedAt ? "initial" : "incremental";
  const startedAt = new Date().toISOString();
  const logRef = adminDb.collection("tenants").doc(tenantId).collection(QUICKBOOKS_LOGS_COLLECTION).doc();

  await getTenantIntegrationRef(tenantId).set(
    {
      stats: {
        ...(integration.stats || defaultStats()),
        lastSyncStartedAt: startedAt,
        lastSyncStatus: "running",
        lastSyncError: null,
      },
    },
    { merge: true }
  );

  let conflicts = 0;
  try {
    const settings = integration.settings || defaultSettings();
    const invoicesSince = mode === "initial" ? null : integration.cursor?.invoicesLastSyncAt || null;
    const paymentsSince = mode === "initial" ? null : integration.cursor?.paymentsLastSyncAt || null;
    const customersSince = mode === "initial" ? null : integration.cursor?.customersLastSyncAt || null;
    const accountsSince = mode === "initial" ? null : integration.cursor?.accountsLastSyncAt || null;
    const taxRatesSince = mode === "initial" ? null : integration.cursor?.taxRatesLastSyncAt || null;

    const invoices = settings.syncInvoicesToQuickBooks ? await syncInvoicesToQuickBooks(tenantId, invoicesSince) : mapSyncEntityResult();
    const qbPayments = settings.syncPaymentsFromQuickBooks
      ? await syncPaymentsFromQuickBooks(tenantId, paymentsSince, settings)
      : { result: mapSyncEntityResult(), conflicts: 0 };
    conflicts += qbPayments.conflicts;

    let customers = mapSyncEntityResult();
    if (settings.syncCustomersTwoWay) {
      const inbound = await syncCustomersFromQuickBooks(tenantId, customersSince, settings);
      const outbound = await syncCustomersToQuickBooks(tenantId, customersSince);
      customers = {
        inserted: inbound.result.inserted + outbound.inserted,
        updated: inbound.result.updated + outbound.updated,
        skipped: inbound.result.skipped + outbound.skipped,
      };
      conflicts += inbound.conflicts;
    }

    const accounts = settings.syncAccounts ? await syncAccountsFromQuickBooks(tenantId, accountsSince) : mapSyncEntityResult();
    const taxRates = settings.syncTaxRates ? await syncTaxRatesFromQuickBooks(tenantId, taxRatesSince) : mapSyncEntityResult();

    const finishedAt = new Date().toISOString();
    const summary: QuickBooksSyncRunResult = {
      mode,
      invoices,
      payments: qbPayments.result,
      customers,
      accounts,
      taxRates,
      conflicts,
      startedAt,
      finishedAt,
    };

    await Promise.all([
      getTenantIntegrationRef(tenantId).set(
        {
          cursor: {
            ...(integration.cursor || defaultCursor()),
            fullSyncCompletedAt: mode === "initial" ? finishedAt : integration.cursor?.fullSyncCompletedAt || finishedAt,
            invoicesLastSyncAt: finishedAt,
            paymentsLastSyncAt: finishedAt,
            customersLastSyncAt: finishedAt,
            accountsLastSyncAt: finishedAt,
            taxRatesLastSyncAt: finishedAt,
          },
          stats: {
            ...(integration.stats || defaultStats()),
            lastSyncStartedAt: startedAt,
            lastSyncFinishedAt: finishedAt,
            lastSyncStatus: "success",
            lastSyncError: null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: input.userUid,
        },
        { merge: true }
      ),
      logRef.set({
        tenantId,
        mode,
        status: "success",
        ...summary,
        triggeredBy: input.userUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    return summary;
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    const safeMessage = String(error?.message || "QuickBooks sync failed.");

    await Promise.all([
      getTenantIntegrationRef(tenantId).set(
        {
          stats: {
            ...(integration.stats || defaultStats()),
            lastSyncStartedAt: startedAt,
            lastSyncFinishedAt: finishedAt,
            lastSyncStatus: "error",
            lastSyncError: safeMessage,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: input.userUid,
        },
        { merge: true }
      ),
      logRef.set({
        tenantId,
        mode,
        status: "error",
        error: safeMessage,
        conflicts,
        startedAt,
        finishedAt,
        triggeredBy: input.userUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    throw error;
  }
}

export async function getQuickBooksCompanyInfo(accessToken: string, realmId: string) {
  const cfg = getQuickBooksOAuthConfig();
  const response = await fetch(`${cfg.apiBaseUrl}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || data?.Fault) {
    return { companyName: null };
  }

  return {
    companyName: getString(data?.CompanyInfo?.CompanyName || data?.CompanyInfo?.LegalName) || null,
  };
}
