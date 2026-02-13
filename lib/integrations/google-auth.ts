import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

const GOOGLE_TOKEN_DOC = "googleWorkspace";
const GOOGLE_STATE_COLLECTION = "googleOAuthStates";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

type TokenPayload = {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
};

export type GoogleIntegrationConfig = {
  tenantId: string;
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  calendarSyncEnabled: boolean;
  driveFolderId: string | null;
  gmailEnabled: boolean;
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
  const raw = String(process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is required for Google token storage.");
  }

  const candidate = raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (candidate.length !== 32) {
    throw new Error("GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
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

export function getGoogleOauthConfig() {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be configured.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${getBaseUrl()}/api/integrations/google/callback`,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  };
}

export function buildGoogleAuthUrl(params: { tenantId: string; userUid: string; returnTo?: string }) {
  const state = crypto.randomBytes(24).toString("base64url");
  return { state, url: buildGoogleAuthUrlFromState(state), expiresAt: Date.now() + 10 * 60_000 };
}

function buildGoogleAuthUrlFromState(state: string) {
  const config = getGoogleOauthConfig();
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function storeGoogleOAuthState(input: {
  state: string;
  tenantId: string;
  userUid: string;
  returnTo?: string;
  expiresAt: number;
}) {
  await adminDb.collection(GOOGLE_STATE_COLLECTION).doc(input.state).set({
    state: input.state,
    tenantId: input.tenantId,
    userUid: input.userUid,
    returnTo: input.returnTo || "/admin/settings/integrations",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(input.expiresAt),
  });
}

export async function consumeGoogleOAuthState(state: string) {
  const ref = adminDb.collection(GOOGLE_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invalid OAuth state.");
  const data = snap.data() as any;
  if (!data?.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error("OAuth state expired.");
  }
  await ref.delete();
  return data as { tenantId: string; userUid: string; returnTo: string };
}

export async function exchangeGoogleCodeForTokens(code: string): Promise<TokenPayload> {
  const config = getGoogleOauthConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Failed to exchange Google OAuth code.");
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

export async function saveGoogleTokens(params: {
  tenantId: string;
  userUid: string;
  accountEmail: string;
  tokenPayload: TokenPayload;
}) {
  const ref = adminDb.collection("tenants").doc(params.tenantId).collection("integrations").doc(GOOGLE_TOKEN_DOC);
  const encrypted = encryptJson(params.tokenPayload);
  await ref.set(
    {
      tenantId: params.tenantId,
      connected: true,
      accountEmail: params.accountEmail,
      scopes: (params.tokenPayload.scope || "").split(" ").filter(Boolean),
      calendarSyncEnabled: true,
      driveFolderId: null,
      gmailEnabled: true,
      tokensEncrypted: encrypted,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    } satisfies GoogleIntegrationConfig,
    { merge: true }
  );
}

export async function getGoogleIntegration(tenantId: string): Promise<GoogleIntegrationConfig | null> {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(GOOGLE_TOKEN_DOC).get();
  if (!snap.exists) return null;
  return snap.data() as GoogleIntegrationConfig;
}

export async function getValidGoogleAccessToken(tenantId: string): Promise<string> {
  const ref = adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(GOOGLE_TOKEN_DOC);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Google Workspace is not connected for this tenant.");

  const record = snap.data() as GoogleIntegrationConfig;
  if (!record.tokensEncrypted) throw new Error("Missing Google OAuth tokens.");

  const tokens = decryptJson<TokenPayload>(record.tokensEncrypted);
  if (tokens.expiry_date > Date.now() + 60_000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    throw new Error("Google refresh token is unavailable. Reconnect Google Workspace.");
  }

  const config = getGoogleOauthConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const refreshed = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !refreshed?.access_token) {
    throw new Error(refreshed?.error_description || refreshed?.error || "Google token refresh failed.");
  }

  const mergedTokens: TokenPayload = {
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

export async function getGoogleProfile(accessToken: string): Promise<{ email: string }> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok || !data?.email) {
    throw new Error("Failed to load Google profile.");
  }
  return { email: String(data.email).toLowerCase() };
}
