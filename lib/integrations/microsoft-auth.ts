import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

const MICROSOFT_TOKEN_DOC = "microsoft365";
const MICROSOFT_STATE_COLLECTION = "microsoftOAuthStates";
const MICROSOFT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
  "Files.ReadWrite",
  "Mail.Send",
] as const;

type MicrosoftTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
};

export type MicrosoftIntegrationConfig = {
  tenantId: string;
  connected: boolean;
  accountEmail: string | null;
  accountDisplayName: string | null;
  microsoftTenantId: string | null;
  scopes: string[];
  calendarSyncEnabled: boolean;
  outlookEmailEnabled: boolean;
  oneDriveRootFolderId: string | null;
  oneDriveRootFolderName: string | null;
  tokensEncrypted: string | null;
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function getEncryptionKey(): Buffer {
  const raw = String(process.env.MICROSOFT_OAUTH_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("MICROSOFT_OAUTH_TOKEN_ENCRYPTION_KEY is required for Microsoft token storage.");
  }

  const candidate = raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (candidate.length !== 32) {
    throw new Error("MICROSOFT_OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return candidate;
}

function encryptJson(value: unknown): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encoded = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encoded]).toString("base64");
}

function decryptJson<T>(encrypted: string): T {
  const key = getEncryptionKey();
  const buffer = Buffer.from(encrypted, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const payload = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  return JSON.parse(decoded) as T;
}

export function getMicrosoftOauthConfig() {
  const clientId = String(process.env.MICROSOFT_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "").trim();
  const authorityTenant = String(process.env.MICROSOFT_OAUTH_AUTHORITY_TENANT || "common").trim() || "common";

  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET must be configured.");
  }

  return {
    clientId,
    clientSecret,
    authorityTenant,
    redirectUri: `${getBaseUrl()}/api/integrations/microsoft/callback`,
    authorizeUrl: `https://login.microsoftonline.com/${encodeURIComponent(authorityTenant)}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(authorityTenant)}/oauth2/v2.0/token`,
  };
}

export function buildMicrosoftAuthUrl(_params: { tenantId: string; userUid: string; returnTo?: string }) {
  const state = crypto.randomBytes(24).toString("base64url");
  return { state, url: buildMicrosoftAuthUrlFromState(state), expiresAt: Date.now() + 10 * 60_000 };
}

function buildMicrosoftAuthUrlFromState(state: string) {
  const config = getMicrosoftOauthConfig();
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function storeMicrosoftOAuthState(input: {
  state: string;
  tenantId: string;
  userUid: string;
  returnTo?: string;
  expiresAt: number;
}) {
  await adminDb.collection(MICROSOFT_STATE_COLLECTION).doc(input.state).set({
    state: input.state,
    tenantId: input.tenantId,
    userUid: input.userUid,
    returnTo: input.returnTo || "/admin/settings/integrations",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(input.expiresAt),
  });
}

export async function consumeMicrosoftOAuthState(state: string) {
  const ref = adminDb.collection(MICROSOFT_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invalid OAuth state.");

  const data = snap.data() as { tenantId?: string; userUid?: string; returnTo?: string; expiresAt?: admin.firestore.Timestamp };
  if (!data.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error("OAuth state expired.");
  }

  await ref.delete();
  if (!data.tenantId || !data.userUid) throw new Error("OAuth state payload is invalid.");
  return { tenantId: data.tenantId, userUid: data.userUid, returnTo: data.returnTo || "/admin/settings/integrations" };
}

export async function exchangeMicrosoftCodeForTokens(code: string): Promise<MicrosoftTokenPayload> {
  const config = getMicrosoftOauthConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; id_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to exchange Microsoft OAuth code.");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + Number(data.expires_in || 3600) * 1000,
    token_type: data.token_type,
    scope: data.scope,
    id_token: data.id_token,
  };
}

export async function getMicrosoftProfile(accessToken: string): Promise<{ email: string; displayName: string | null; tenantId: string | null }> {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE}/me?$select=mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string; displayName?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to load Microsoft profile.");
  }

  const email = String(data.mail || data.userPrincipalName || "").toLowerCase().trim();
  if (!email) throw new Error("Microsoft account email is unavailable.");

  const tenantId = parseTenantIdFromJwt(accessToken);

  return { email, displayName: data.displayName || null, tenantId };
}

function parseTenantIdFromJwt(accessToken: string): string | null {
  const segments = accessToken.split(".");
  if (segments.length < 2) return null;

  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as { tid?: string };
    return typeof payload.tid === "string" && payload.tid.length > 0 ? payload.tid : null;
  } catch {
    return null;
  }
}

export async function saveMicrosoftTokens(params: {
  tenantId: string;
  userUid: string;
  accountEmail: string;
  accountDisplayName?: string | null;
  microsoftTenantId?: string | null;
  tokenPayload: MicrosoftTokenPayload;
}) {
  const ref = adminDb.collection("tenants").doc(params.tenantId).collection("integrations").doc(MICROSOFT_TOKEN_DOC);
  await ref.set(
    {
      tenantId: params.tenantId,
      connected: true,
      accountEmail: params.accountEmail,
      accountDisplayName: params.accountDisplayName || null,
      microsoftTenantId: params.microsoftTenantId || null,
      scopes: String(params.tokenPayload.scope || "").split(" ").filter(Boolean),
      calendarSyncEnabled: true,
      outlookEmailEnabled: true,
      oneDriveRootFolderId: null,
      oneDriveRootFolderName: null,
      tokensEncrypted: encryptJson(params.tokenPayload),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    } satisfies MicrosoftIntegrationConfig,
    { merge: true }
  );
}

export async function getMicrosoftIntegration(tenantId: string): Promise<MicrosoftIntegrationConfig | null> {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(MICROSOFT_TOKEN_DOC).get();
  if (!snap.exists) return null;
  return snap.data() as MicrosoftIntegrationConfig;
}

export async function getValidMicrosoftAccessToken(tenantId: string): Promise<string> {
  const ref = adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(MICROSOFT_TOKEN_DOC);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Microsoft 365 is not connected for this tenant.");

  const record = snap.data() as MicrosoftIntegrationConfig;
  if (!record.tokensEncrypted) throw new Error("Missing Microsoft OAuth tokens.");

  const tokens = decryptJson<MicrosoftTokenPayload>(record.tokensEncrypted);
  if (tokens.expiry_date > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("Microsoft refresh token is unavailable. Reconnect Microsoft 365.");

  const config = getMicrosoftOauthConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });

  const refreshed = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; token_type?: string; scope?: string; error_description?: string; error?: string };
  if (!response.ok || !refreshed.access_token) {
    throw new Error(refreshed.error_description || refreshed.error || "Microsoft token refresh failed.");
  }

  const mergedTokens: MicrosoftTokenPayload = {
    ...tokens,
    access_token: refreshed.access_token,
    expiry_date: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
    token_type: refreshed.token_type || tokens.token_type,
    scope: refreshed.scope || tokens.scope,
  };

  await ref.set(
    {
      scopes: String(mergedTokens.scope || "").split(" ").filter(Boolean),
      tokensEncrypted: encryptJson(mergedTokens),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return mergedTokens.access_token;
}
