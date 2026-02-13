import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant";

const XERO_DOC_ID = "xero";
const XERO_STATE_COLLECTION = "xeroOAuthStates";
const XERO_LOGS_COLLECTION = "xeroSyncLogs";
const XERO_MAX_PAGE = 100;

export type XeroConflictMode = "last_write_wins" | "manual";

export type XeroSyncSettings = {
  syncInvoicesToXero: boolean;
  syncPaymentsFromXero: boolean;
  syncContactsTwoWay: boolean;
  syncAccounts: boolean;
  syncTaxRates: boolean;
  scheduleDaily: boolean;
  conflictMode: XeroConflictMode;
};

export type XeroIntegrationConfig = {
  tenantId: string;
  connected: boolean;
  organizationId: string | null;
  organizationName: string | null;
  scopes: string[];
  tokensEncrypted: string | null;
  settings: XeroSyncSettings;
  cursor: {
    fullSyncCompletedAt: string | null;
    invoicesLastSyncAt: string | null;
    paymentsLastSyncAt: string | null;
    contactsLastSyncAt: string | null;
    accountsLastSyncAt: string | null;
    taxRatesLastSyncAt: string | null;
  };
  stats: {
    lastSyncStartedAt: string | null;
    lastSyncFinishedAt: string | null;
    lastSyncStatus: "idle" | "running" | "success" | "error";
    lastSyncError: string | null;
  };
};

type XeroTokenPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  idToken?: string;
};

type SyncEntityResult = { inserted: number; updated: number; skipped: number };

export type XeroSyncRunResult = {
  mode: "initial" | "incremental";
  invoices: SyncEntityResult;
  payments: SyncEntityResult;
  contacts: SyncEntityResult;
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
  const raw = String(process.env.XERO_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("XERO_TOKEN_ENCRYPTION_KEY is required.");
  const key = raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("XERO_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
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

export function getXeroOAuthConfig() {
  const clientId = String(process.env.XERO_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.XERO_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("XERO_CLIENT_ID and XERO_CLIENT_SECRET are required.");

  return {
    clientId,
    clientSecret,
    redirectUri: `${getBaseUrl()}/api/integrations/xero/callback`,
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    apiBaseUrl: process.env.XERO_API_BASE_URL || "https://api.xero.com/api.xro/2.0",
    scopes: ["offline_access", "openid", "profile", "email", "accounting.transactions", "accounting.contacts", "accounting.settings"],
  };
}

function defaultSettings(): XeroSyncSettings {
  return {
    syncInvoicesToXero: true,
    syncPaymentsFromXero: true,
    syncContactsTwoWay: true,
    syncAccounts: true,
    syncTaxRates: true,
    scheduleDaily: true,
    conflictMode: "last_write_wins",
  };
}

const defaultCursor = () => ({ fullSyncCompletedAt: null, invoicesLastSyncAt: null, paymentsLastSyncAt: null, contactsLastSyncAt: null, accountsLastSyncAt: null, taxRatesLastSyncAt: null });
const defaultStats = () => ({ lastSyncStartedAt: null, lastSyncFinishedAt: null, lastSyncStatus: "idle" as const, lastSyncError: null });
const mapSyncEntityResult = (): SyncEntityResult => ({ inserted: 0, updated: 0, skipped: 0 });
const getTenantIntegrationRef = (tenantId: string) => adminDb.collection("tenants").doc(normalizeTenantId(tenantId)).collection("integrations").doc(XERO_DOC_ID);
const getString = (value: unknown) => String(value || "").trim();

function parseXeroDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/\/Date\((\d+)/);
  if (match) return new Date(Number(match[1])).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function compareLocalVsRemote(localUpdatedAt: string | null, remoteUpdatedAt: string | null) {
  const localTs = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
  const remoteTs = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
  return localTs - remoteTs;
}

export async function createXeroOAuthState(params: { tenantId: string; userUid: string; returnTo?: string }) {
  const state = crypto.randomBytes(24).toString("base64url");
  await adminDb.collection(XERO_STATE_COLLECTION).doc(state).set({
    state,
    tenantId: normalizeTenantId(params.tenantId),
    userUid: params.userUid,
    returnTo: params.returnTo || "/admin/settings/integrations/xero",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60_000),
  });
  return state;
}

export async function consumeXeroOAuthState(state: string) {
  const ref = adminDb.collection(XERO_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invalid Xero OAuth state.");
  const data = snap.data() as any;
  if (!data?.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error("Xero OAuth state expired.");
  }
  await ref.delete();
  return data as { tenantId: string; userUid: string; returnTo: string };
}

export function buildXeroAuthorizeUrl(state: string) {
  const cfg = getXeroOAuthConfig();
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeXeroCodeForTokens(code: string): Promise<XeroTokenPayload> {
  const cfg = getXeroOAuthConfig();
  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }),
  });
  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.error_description || data.error || "Xero OAuth exchange failed.");
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000, idToken: data.id_token };
}

async function refreshXeroToken(current: XeroTokenPayload): Promise<XeroTokenPayload> {
  const cfg = getXeroOAuthConfig();
  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refreshToken }),
  });
  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.error_description || data.error || "Xero token refresh failed.");
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in || 1800) * 1000, idToken: data.id_token || current.idToken };
}

export async function getXeroConnections(accessToken: string) {
  const response = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
  const data = (await response.json().catch(() => [])) as any[];
  if (!response.ok || !Array.isArray(data)) throw new Error("Unable to fetch Xero organizations.");
  return data;
}

export async function saveXeroConnection(params: { tenantId: string; userUid: string; organizationId: string; organizationName: string | null; scopes: string[]; tokenPayload: XeroTokenPayload }) {
  await getTenantIntegrationRef(params.tenantId).set({
    tenantId: normalizeTenantId(params.tenantId),
    connected: true,
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    scopes: params.scopes,
    tokensEncrypted: encryptJson(params.tokenPayload),
    settings: defaultSettings(),
    cursor: defaultCursor(),
    stats: defaultStats(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: params.userUid,
  } satisfies XeroIntegrationConfig & Record<string, unknown>, { merge: true });
}

export async function getXeroIntegration(tenantId: string): Promise<XeroIntegrationConfig | null> {
  const snap = await getTenantIntegrationRef(tenantId).get();
  if (!snap.exists) return null;
  const value = snap.data() as XeroIntegrationConfig;
  return { ...value, settings: { ...defaultSettings(), ...(value.settings || {}) }, cursor: { ...defaultCursor(), ...(value.cursor || {}) }, stats: { ...defaultStats(), ...(value.stats || {}) } };
}

async function getAccessTokenAndOrganization(tenantId: string) {
  const ref = getTenantIntegrationRef(tenantId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Xero is not connected for this tenant.");
  const config = snap.data() as XeroIntegrationConfig;
  if (!config.connected || !config.tokensEncrypted || !config.organizationId) throw new Error("Xero connection is incomplete.");
  const tokenPayload = decryptJson<XeroTokenPayload>(config.tokensEncrypted);
  if (tokenPayload.expiresAt > Date.now() + 60_000) return { accessToken: tokenPayload.accessToken, organizationId: config.organizationId };
  const refreshed = await refreshXeroToken(tokenPayload);
  await ref.set({ tokensEncrypted: encryptJson(refreshed), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { accessToken: refreshed.accessToken, organizationId: config.organizationId };
}

async function callXeroApi<T>(tenantId: string, path: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  const cfg = getXeroOAuthConfig();
  const { accessToken, organizationId } = await getAccessTokenAndOrganization(tenantId);
  const response = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json", "Xero-Tenant-Id": organizationId },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) throw new Error(data?.Detail || data?.Message || data?.error_description || `Xero API request failed (${response.status})`);
  return data as T;
}

async function syncInvoicesToXero(tenantId: string) {
  const result = mapSyncEntityResult();
  const invoices = await adminDb.collection("invoices").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(XERO_MAX_PAGE).get();
  for (const doc of invoices.docs) {
    const invoice = doc.data() as any;
    if (getString(invoice?.xero?.id)) { result.skipped += 1; continue; }
    const clientId = getString(invoice.clientId);
    const clientSnap = clientId ? await adminDb.collection("clients").doc(clientId).get() : null;
    const xeroContactId = getString(clientSnap?.data()?.xero?.id);
    if (!xeroContactId) { result.skipped += 1; continue; }
    const amount = Number(invoice.amountTotal || invoice.totalUSD || 0);
    const payload = {
      Type: "ACCREC",
      Contact: { ContactID: xeroContactId },
      Date: parseXeroDate(invoice.issuedAt)?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      DueDate: parseXeroDate(invoice.dueDate)?.slice(0, 10) || undefined,
      LineItems: [{ Description: getString(invoice.orderId || `Invoice ${doc.id}`), Quantity: 1, UnitAmount: Number.isFinite(amount) ? amount : 0, AccountCode: "200" }],
      Status: "AUTHORISED",
      Reference: getString(invoice.invoiceNumber || doc.id),
    };
    const response = await callXeroApi<any>(tenantId, "/Invoices", "POST", { Invoices: [payload] });
    const created = response?.Invoices?.[0];
    if (!created?.InvoiceID) { result.skipped += 1; continue; }
    await doc.ref.set({ xero: { id: created.InvoiceID, invoiceNumber: getString(created.InvoiceNumber), lastUpdatedAt: parseXeroDate(created.UpdatedDateUTC) }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    result.updated += 1;
  }
  return result;
}

async function syncPaymentsFromXero(tenantId: string, sinceISO: string | null, settings: XeroSyncSettings) {
  const result = mapSyncEntityResult();
  let conflicts = 0;
  const response = await callXeroApi<any>(tenantId, "/Payments?page=1");
  const payments = Array.isArray(response?.Payments) ? response.Payments : [];
  for (const payment of payments) {
    const remoteUpdatedAt = parseXeroDate(payment?.UpdatedDateUTC || payment?.Date);
    if (sinceISO && remoteUpdatedAt && new Date(remoteUpdatedAt).getTime() <= new Date(sinceISO).getTime()) continue;
    const xeroId = getString(payment?.PaymentID);
    if (!xeroId) { result.skipped += 1; continue; }
    const existing = await adminDb.collection("payments").where("tenantId", "==", tenantId).where("xero.id", "==", xeroId).limit(1).get();
    if (!existing.empty) {
      const current = existing.docs[0].data() as any;
      const localUpdatedAt = parseXeroDate(current?.xero?.lastUpdatedAt || current?.updatedAt?.toDate?.()?.toISOString?.());
      if (settings.conflictMode === "manual" && compareLocalVsRemote(localUpdatedAt, remoteUpdatedAt) > 0) { result.skipped += 1; conflicts += 1; continue; }
      await existing.docs[0].ref.set({ amountUsd: Number(payment?.Amount || 0), status: "completed", paidAt: remoteUpdatedAt, updatedAt: admin.firestore.FieldValue.serverTimestamp(), xero: { id: xeroId, lastUpdatedAt: remoteUpdatedAt } }, { merge: true });
      result.updated += 1;
      continue;
    }
    await adminDb.collection("payments").add({ tenantId, amountUsd: Number(payment?.Amount || 0), status: "completed", paidAt: remoteUpdatedAt, source: "xero", createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), xero: { id: xeroId, lastUpdatedAt: remoteUpdatedAt } });
    result.inserted += 1;
  }
  return { result, conflicts };
}

async function syncContactsFromXero(tenantId: string, sinceISO: string | null, settings: XeroSyncSettings) {
  const result = mapSyncEntityResult();
  let conflicts = 0;
  const response = await callXeroApi<any>(tenantId, "/Contacts?page=1");
  const contacts = Array.isArray(response?.Contacts) ? response.Contacts : [];
  for (const contact of contacts) {
    const xeroId = getString(contact?.ContactID);
    if (!xeroId) { result.skipped += 1; continue; }
    const remoteUpdatedAt = parseXeroDate(contact?.UpdatedDateUTC);
    if (sinceISO && remoteUpdatedAt && new Date(remoteUpdatedAt).getTime() <= new Date(sinceISO).getTime()) continue;
    const existing = await adminDb.collection("clients").where("tenantId", "==", tenantId).where("xero.id", "==", xeroId).limit(1).get();
    const payload = {
      companyName: getString(contact?.Name || contact?.ContactName) || "Unknown",
      primaryContactEmail: getString(contact?.EmailAddress),
      primaryContactPhone: getString(contact?.Phones?.[0]?.PhoneNumber),
      website: getString(contact?.Website),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      xero: { id: xeroId, contactNumber: getString(contact?.ContactNumber), lastUpdatedAt: remoteUpdatedAt },
    };
    if (existing.empty) {
      await adminDb.collection("clients").add({ tenantId, ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      result.inserted += 1;
      continue;
    }
    const current = existing.docs[0].data() as any;
    const localUpdatedAt = parseXeroDate(current?.xero?.lastUpdatedAt || current?.updatedAt?.toDate?.()?.toISOString?.());
    if (settings.conflictMode === "manual" && compareLocalVsRemote(localUpdatedAt, remoteUpdatedAt) > 0) { result.skipped += 1; conflicts += 1; continue; }
    await existing.docs[0].ref.set(payload, { merge: true });
    result.updated += 1;
  }
  return { result, conflicts };
}

async function syncContactsToXero(tenantId: string) {
  const result = mapSyncEntityResult();
  const local = await adminDb.collection("clients").where("tenantId", "==", tenantId).limit(XERO_MAX_PAGE).get();
  for (const doc of local.docs) {
    const data = doc.data() as any;
    if (getString(data?.xero?.id)) { result.skipped += 1; continue; }
    const payload = {
      Name: getString(data.companyName || data.primaryContactName || doc.id),
      FirstName: getString(data.primaryContactName).split(" ")[0] || undefined,
      LastName: getString(data.primaryContactName).split(" ").slice(1).join(" ") || undefined,
      EmailAddress: getString(data.primaryContactEmail) || undefined,
      Phones: data.primaryContactPhone ? [{ PhoneType: "DEFAULT", PhoneNumber: getString(data.primaryContactPhone) }] : undefined,
    };
    const response = await callXeroApi<any>(tenantId, "/Contacts", "POST", { Contacts: [payload] });
    const created = response?.Contacts?.[0];
    if (!created?.ContactID) { result.skipped += 1; continue; }
    await doc.ref.set({ xero: { id: created.ContactID, contactNumber: getString(created.ContactNumber), lastUpdatedAt: parseXeroDate(created.UpdatedDateUTC) }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    result.updated += 1;
  }
  return result;
}

async function syncAccountsFromXero(tenantId: string, sinceISO: string | null) {
  const result = mapSyncEntityResult();
  const response = await callXeroApi<any>(tenantId, "/Accounts");
  const accounts = Array.isArray(response?.Accounts) ? response.Accounts : [];
  for (const account of accounts) {
    const xeroId = getString(account?.AccountID);
    if (!xeroId) { result.skipped += 1; continue; }
    const remoteUpdatedAt = parseXeroDate(account?.UpdatedDateUTC);
    if (sinceISO && remoteUpdatedAt && new Date(remoteUpdatedAt).getTime() <= new Date(sinceISO).getTime()) continue;
    const existing = await adminDb.collection("tenants").doc(tenantId).collection("accounts").where("xero.id", "==", xeroId).limit(1).get();
    const payload = { name: getString(account?.Name), code: getString(account?.Code), type: getString(account?.Type), status: getString(account?.Status) || "ACTIVE", xero: { id: xeroId, lastUpdatedAt: remoteUpdatedAt }, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (existing.empty) {
      await adminDb.collection("tenants").doc(tenantId).collection("accounts").add({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      result.inserted += 1;
    } else {
      await existing.docs[0].ref.set(payload, { merge: true });
      result.updated += 1;
    }
  }
  return result;
}

async function syncTaxRatesFromXero(tenantId: string, sinceISO: string | null) {
  const result = mapSyncEntityResult();
  const response = await callXeroApi<any>(tenantId, "/TaxRates");
  const rates = Array.isArray(response?.TaxRates) ? response.TaxRates : [];
  for (const rate of rates) {
    const xeroId = getString(rate?.TaxType || rate?.Name);
    const remoteUpdatedAt = parseXeroDate(rate?.UpdatedDateUTC);
    if (sinceISO && remoteUpdatedAt && new Date(remoteUpdatedAt).getTime() <= new Date(sinceISO).getTime()) continue;
    const existing = await adminDb.collection("tenants").doc(tenantId).collection("taxRates").where("xero.id", "==", xeroId).limit(1).get();
    const effective = Number(rate?.EffectiveRate || 0);
    const payload = { name: getString(rate?.Name), rate: Number.isFinite(effective) ? effective : 0, enabled: getString(rate?.Status) !== "DELETED", type: "simple", applies_to: "subtotal", xero: { id: xeroId, lastUpdatedAt: remoteUpdatedAt }, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (existing.empty) {
      await adminDb.collection("tenants").doc(tenantId).collection("taxRates").add({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      result.inserted += 1;
    } else {
      await existing.docs[0].ref.set(payload, { merge: true });
      result.updated += 1;
    }
  }
  return result;
}

export async function updateXeroSettings(tenantId: string, userUid: string, patch: Partial<XeroSyncSettings>): Promise<XeroSyncSettings> {
  const current = await getXeroIntegration(tenantId);
  const merged = {
    ...(current?.settings || defaultSettings()),
    ...patch,
    conflictMode: patch.conflictMode === "manual" ? "manual" : patch.conflictMode === "last_write_wins" ? "last_write_wins" : (current?.settings?.conflictMode || "last_write_wins"),
  };
  await getTenantIntegrationRef(tenantId).set({ tenantId: normalizeTenantId(tenantId), settings: merged, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: userUid }, { merge: true });
  return merged;
}

export async function getXeroSyncLogs(tenantId: string, limit = 50) {
  const capped = Math.min(Math.max(limit, 1), 200);
  const snapshot = await adminDb.collection("tenants").doc(normalizeTenantId(tenantId)).collection(XERO_LOGS_COLLECTION).orderBy("startedAt", "desc").limit(capped).get();
  return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
}

export async function runXeroSync(input: { tenantId: string; userUid: string; forceInitial?: boolean }) {
  const tenantId = normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
  const integration = await getXeroIntegration(tenantId);
  if (!integration?.connected) throw new Error("Xero is not connected.");
  const mode: "initial" | "incremental" = input.forceInitial || !integration.cursor?.fullSyncCompletedAt ? "initial" : "incremental";
  const startedAt = new Date().toISOString();
  const logRef = adminDb.collection("tenants").doc(tenantId).collection(XERO_LOGS_COLLECTION).doc();

  await getTenantIntegrationRef(tenantId).set({ stats: { ...(integration.stats || defaultStats()), lastSyncStartedAt: startedAt, lastSyncStatus: "running", lastSyncError: null } }, { merge: true });

  let conflicts = 0;
  try {
    const settings = integration.settings || defaultSettings();
    const invoices = settings.syncInvoicesToXero ? await syncInvoicesToXero(tenantId) : mapSyncEntityResult();
    const payments = settings.syncPaymentsFromXero ? await syncPaymentsFromXero(tenantId, mode === "initial" ? null : integration.cursor?.paymentsLastSyncAt || null, settings) : { result: mapSyncEntityResult(), conflicts: 0 };
    conflicts += payments.conflicts;
    let contacts = mapSyncEntityResult();
    if (settings.syncContactsTwoWay) {
      const inbound = await syncContactsFromXero(tenantId, mode === "initial" ? null : integration.cursor?.contactsLastSyncAt || null, settings);
      const outbound = await syncContactsToXero(tenantId);
      contacts = { inserted: inbound.result.inserted + outbound.inserted, updated: inbound.result.updated + outbound.updated, skipped: inbound.result.skipped + outbound.skipped };
      conflicts += inbound.conflicts;
    }
    const accounts = settings.syncAccounts ? await syncAccountsFromXero(tenantId, mode === "initial" ? null : integration.cursor?.accountsLastSyncAt || null) : mapSyncEntityResult();
    const taxRates = settings.syncTaxRates ? await syncTaxRatesFromXero(tenantId, mode === "initial" ? null : integration.cursor?.taxRatesLastSyncAt || null) : mapSyncEntityResult();
    const finishedAt = new Date().toISOString();
    const summary: XeroSyncRunResult = { mode, invoices, payments: payments.result, contacts, accounts, taxRates, conflicts, startedAt, finishedAt };

    await Promise.all([
      getTenantIntegrationRef(tenantId).set({
        cursor: { ...(integration.cursor || defaultCursor()), fullSyncCompletedAt: mode === "initial" ? finishedAt : integration.cursor?.fullSyncCompletedAt || finishedAt, invoicesLastSyncAt: finishedAt, paymentsLastSyncAt: finishedAt, contactsLastSyncAt: finishedAt, accountsLastSyncAt: finishedAt, taxRatesLastSyncAt: finishedAt },
        stats: { ...(integration.stats || defaultStats()), lastSyncStartedAt: startedAt, lastSyncFinishedAt: finishedAt, lastSyncStatus: "success", lastSyncError: null },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: input.userUid,
      }, { merge: true }),
      logRef.set({ tenantId, status: "success", ...summary, triggeredBy: input.userUid, createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    ]);

    return summary;
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    const safeMessage = String(error?.message || "Xero sync failed.");
    await Promise.all([
      getTenantIntegrationRef(tenantId).set({ stats: { ...(integration.stats || defaultStats()), lastSyncStartedAt: startedAt, lastSyncFinishedAt: finishedAt, lastSyncStatus: "error", lastSyncError: safeMessage }, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: input.userUid }, { merge: true }),
      logRef.set({ tenantId, mode, status: "error", error: safeMessage, conflicts, startedAt, finishedAt, triggeredBy: input.userUid, createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    ]);
    throw error;
  }
}
