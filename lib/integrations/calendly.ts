import crypto from "crypto";
import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { TaskService } from "@/lib/projects/task-service";

const CALENDLY_DOC_ID = "calendly";
const CALENDLY_STATE_COLLECTION = "calendlyOAuthStates";
const CALENDLY_API_BASE = "https://api.calendly.com";

export type CalendlyConnection = {
  tenantId: string;
  connected: boolean;
  accountUri: string | null;
  organizationUri: string | null;
  userUri: string | null;
  accountEmail: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: string | null;
  webhookSigningKeyEncrypted: string | null;
  webhookSubscriptionUri: string | null;
  defaultProjectId: string | null;
  widgetUrl: string | null;
  syncEnabled: boolean;
  createTasksFromMeetings: boolean;
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

export type CalendlyMeetingRecord = {
  id: string;
  tenantId: string;
  calendlyEventUri: string;
  calendlyInviteeUri: string | null;
  eventTypeName: string | null;
  status: "scheduled" | "canceled" | "rescheduled";
  title: string;
  startTime: string;
  endTime: string;
  timezone: string | null;
  meetingUrl: string | null;
  cancelUrl: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  notes: string | null;
  projectTaskId: string | null;
  rescheduledFromInviteeUri: string | null;
  raw: Record<string, unknown>;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function getEncryptionKey(): Buffer {
  const raw = String(process.env.CALENDLY_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("CALENDLY_TOKEN_ENCRYPTION_KEY is required.");
  const key = raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CALENDLY_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}

function encrypt(value: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const payload = Buffer.from(encrypted, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const enc = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function integrationRef(tenantId: string) {
  return adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(CALENDLY_DOC_ID);
}

function meetingsCollection(tenantId: string) {
  return adminDb.collection("tenants").doc(tenantId).collection("calendlyMeetings");
}

export function getCalendlyOAuthConfig() {
  const clientId = String(process.env.CALENDLY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.CALENDLY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("CALENDLY_CLIENT_ID and CALENDLY_CLIENT_SECRET are required.");
  return {
    clientId,
    clientSecret,
    authorizeUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    redirectUri: `${getBaseUrl()}/api/integrations/calendly/callback`,
    scopes: ["default"],
  };
}

export async function createCalendlyOAuthState(params: { tenantId: string; userUid: string; returnTo?: string }) {
  const state = crypto.randomBytes(24).toString("base64url");
  await adminDb.collection(CALENDLY_STATE_COLLECTION).doc(state).set({
    state,
    tenantId: params.tenantId,
    userUid: params.userUid,
    returnTo: params.returnTo || "/admin/settings/integrations",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60_000),
  });
  return state;
}

export async function consumeCalendlyOAuthState(state: string) {
  const ref = adminDb.collection(CALENDLY_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invalid Calendly OAuth state.");
  const data = snap.data() as { expiresAt?: Timestamp; tenantId: string; userUid: string; returnTo: string };
  if (!data?.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error("Calendly OAuth state expired.");
  }
  await ref.delete();
  return data;
}

export function buildCalendlyAuthorizeUrl(state: string) {
  const cfg = getCalendlyOAuthConfig();
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", cfg.scopes.join(" "));
  return url.toString();
}

export async function exchangeCalendlyCodeForTokens(code: string) {
  const cfg = getCalendlyOAuthConfig();
  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    owner?: string;
    scope?: string;
    error?: string;
    message?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Calendly OAuth exchange failed.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
  };
}

async function calendlyRequest<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CALENDLY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & { title?: string; message?: string };
  if (!response.ok) {
    throw new Error(data?.message || data?.title || "Calendly API request failed.");
  }
  return data;
}

async function fetchCurrentCalendlyUser(accessToken: string) {
  const me = await calendlyRequest<{ resource?: { uri?: string; current_organization?: string; email?: string } }>(accessToken, "/users/me");
  if (!me?.resource?.uri || !me?.resource?.current_organization) throw new Error("Unable to resolve Calendly account metadata.");
  return {
    userUri: me.resource.uri,
    organizationUri: me.resource.current_organization,
    accountEmail: me.resource.email || null,
  };
}

export async function saveCalendlyConnection(params: {
  tenantId: string;
  userUid: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  webhookSigningKey?: string | null;
  widgetUrl?: string | null;
}) {
  const existing = await getCalendlyIntegration(params.tenantId);
  const current = await fetchCurrentCalendlyUser(params.accessToken);

  await integrationRef(params.tenantId).set(
    {
      tenantId: params.tenantId,
      connected: true,
      accountUri: current.organizationUri,
      organizationUri: current.organizationUri,
      userUri: current.userUri,
      accountEmail: current.accountEmail,
      accessTokenEncrypted: encrypt(params.accessToken),
      refreshTokenEncrypted: params.refreshToken ? encrypt(params.refreshToken) : existing?.refreshTokenEncrypted || null,
      tokenExpiresAt: params.expiresAt,
      webhookSigningKeyEncrypted: params.webhookSigningKey
        ? encrypt(params.webhookSigningKey)
        : existing?.webhookSigningKeyEncrypted || null,
      webhookSubscriptionUri: existing?.webhookSubscriptionUri || null,
      defaultProjectId: existing?.defaultProjectId || null,
      widgetUrl: params.widgetUrl || existing?.widgetUrl || null,
      syncEnabled: existing?.syncEnabled !== false,
      createTasksFromMeetings: existing?.createTasksFromMeetings !== false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: params.userUid,
    } satisfies CalendlyConnection,
    { merge: true }
  );
}


export async function ensureCalendlyWebhookSubscription(params: { tenantId: string; signingKey: string; userUid: string }) {
  const integration = await getCalendlyIntegration(params.tenantId);
  if (!integration?.organizationUri || !integration?.userUri) throw new Error("Calendly connection metadata is missing.");

  const token = await getCalendlyAccessToken(params.tenantId);
  const callbackUrl = `${getBaseUrl()}/api/integrations/calendly/webhook`;

  const response = await calendlyRequest<{ resource?: { uri?: string } }>(token, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: integration.organizationUri,
      user: integration.userUri,
      scope: "user",
      signing_key: params.signingKey,
    }),
  });

  await integrationRef(params.tenantId).set(
    {
      webhookSigningKeyEncrypted: encrypt(params.signingKey),
      webhookSubscriptionUri: response.resource?.uri || null,
      updatedBy: params.userUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return response.resource?.uri || null;
}
export async function getCalendlyIntegration(tenantId: string): Promise<CalendlyConnection | null> {
  const snap = await integrationRef(tenantId).get();
  if (!snap.exists) return null;
  return snap.data() as CalendlyConnection;
}

async function getCalendlyAccessToken(tenantId: string) {
  const integration = await getCalendlyIntegration(tenantId);
  if (!integration?.connected || !integration.accessTokenEncrypted) {
    throw new Error("Calendly integration is not connected.");
  }
  return decrypt(integration.accessTokenEncrypted);
}

export async function updateCalendlySettings(
  tenantId: string,
  patch: Partial<Pick<CalendlyConnection, "defaultProjectId" | "widgetUrl" | "syncEnabled" | "createTasksFromMeetings">>
) {
  await integrationRef(tenantId).set(
    {
      defaultProjectId: patch.defaultProjectId === undefined ? undefined : patch.defaultProjectId,
      widgetUrl: patch.widgetUrl === undefined ? undefined : patch.widgetUrl,
      syncEnabled: patch.syncEnabled === undefined ? undefined : Boolean(patch.syncEnabled),
      createTasksFromMeetings: patch.createTasksFromMeetings === undefined ? undefined : Boolean(patch.createTasksFromMeetings),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listCalendlyEvents(tenantId: string, limit = 50) {
  const snap = await meetingsCollection(tenantId).orderBy("startTime", "desc").limit(Math.min(Math.max(limit, 1), 100)).get();
  return snap.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
}

async function createTaskForMeeting(params: {
  tenantId: string;
  inviteeName: string | null;
  eventTypeName: string | null;
  startTime: string;
  notes: string | null;
}): Promise<string | null> {
  const integration = await getCalendlyIntegration(params.tenantId);
  if (!integration?.createTasksFromMeetings || !integration.defaultProjectId) return null;

  const projectDoc = await adminDb.collection("projects").doc(integration.defaultProjectId).get();
  if (!projectDoc.exists) return null;
  const projectData = projectDoc.data() as { tenantId?: string; name?: string; managerId?: string; managerName?: string };
  if (projectData.tenantId !== params.tenantId) return null;

  const dueDate = new Date(params.startTime);
  const taskId = await TaskService.createTask({
    tenantId: params.tenantId,
    projectId: integration.defaultProjectId,
    projectName: projectData.name || "Meeting Follow-up",
    title: `Client meeting follow-up: ${params.eventTypeName || "Calendly Meeting"}`,
    description: [
      params.inviteeName ? `Invitee: ${params.inviteeName}` : null,
      `Meeting start: ${new Date(params.startTime).toISOString()}`,
      params.notes ? `Notes: ${params.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    priority: "medium",
    assignedTo: projectData.managerId,
    assignedToName: projectData.managerName,
    assignedBy: "calendly-system",
    assignedByName: "Calendly Sync",
    dueDate,
  });

  return taskId;
}

export async function upsertMeetingFromCalendlyWebhook(params: { tenantId: string; payload: unknown }) {
  const invitee = (params.payload as Record<string, unknown>)?.payload as Record<string, unknown>;
  const event = invitee?.event as Record<string, unknown>;
  if (!invitee?.uri || !event?.uri) throw new Error("Webhook payload missing event details.");

  const existingSnap = await meetingsCollection(params.tenantId).where("calendlyInviteeUri", "==", invitee.uri).limit(1).get();
  const existing = existingSnap.docs[0];

  const status = invitee.status === "canceled" ? "canceled" : invitee.rescheduled ? "rescheduled" : "scheduled";
  const eventLocation = event.location as Record<string, unknown> | undefined;
  const qaList = invitee.questions_and_answers as Record<string, unknown>[] | undefined;

  const baseRecord = {
    tenantId: params.tenantId,
    calendlyEventUri: event.uri,
    calendlyInviteeUri: invitee.uri,
    eventTypeName: event.name || null,
    status,
    title: event.name || "Calendly Meeting",
    startTime: String(event.start_time || invitee.start_time || new Date().toISOString()),
    endTime: String(event.end_time || invitee.end_time || event.start_time || new Date().toISOString()),
    timezone: eventLocation?.timezone || invitee.timezone || null,
    meetingUrl: eventLocation?.join_url || invitee.cancel_url || null,
    cancelUrl: invitee.cancel_url || null,
    inviteeName: invitee.name || null,
    inviteeEmail: invitee.email || null,
    notes: invitee.text_reminder_number || (qaList?.map((qa) => `${qa.question}: ${qa.answer}`).join("; ")) || null,
    rescheduledFromInviteeUri: invitee.old_invitee || null,
    raw: params.payload,
    updatedAt: Timestamp.now(),
  };

  if (existing) {
    await existing.ref.set(baseRecord, { merge: true });
    return existing.id;
  }

  const taskId = status === "scheduled"
    ? await createTaskForMeeting({
        tenantId: params.tenantId,
        inviteeName: invitee.name as unknown || null,
        eventTypeName: event.name || null,
        startTime: String(event.start_time || new Date().toISOString()),
        notes: baseRecord.notes,
      })
    : null;

  const created = await meetingsCollection(params.tenantId).add({
    ...baseRecord,
    projectTaskId: taskId,
    createdAt: Timestamp.now(),
  });
  return created.id;
}

export function verifyCalendlyWebhookSignature(params: {
  signature: string | null;
  body: string;
  tenantId: string;
  timestampHeader?: string | null;
}) {
  if (!params.signature || !params.timestampHeader) return false;

  return getCalendlyIntegration(params.tenantId)
    .then((integration) => {
      if (!integration?.webhookSigningKeyEncrypted) return false;
      const key = decrypt(integration.webhookSigningKeyEncrypted);
      const signedPayload = `${params.timestampHeader}.${params.body}`;
      const digest = crypto.createHmac("sha256", key).update(signedPayload).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(params.signature));
    })
    .catch(() => false);
}

export async function handleCalendlyWebhookByTenant(params: { tenantId: string; payload: unknown }) {
  const integration = await getCalendlyIntegration(params.tenantId);
  if (!integration?.syncEnabled) return;

  const eventType = String((params.payload as Record<string, unknown>)?.event || "").toLowerCase();
  if (eventType === "invitee.created" || eventType === "invitee.canceled") {
    await upsertMeetingFromCalendlyWebhook(params);
  }
}

export async function cancelCalendlyMeeting(params: { tenantId: string; meetingId: string; reason?: string }) {
  const meetingRef = meetingsCollection(params.tenantId).doc(params.meetingId);
  const snap = await meetingRef.get();
  if (!snap.exists) throw new Error("Meeting not found.");
  const meeting = snap.data() as CalendlyMeetingRecord;
  if (!meeting.calendlyInviteeUri) throw new Error("Meeting is missing Calendly invitee URI.");

  const token = await getCalendlyAccessToken(params.tenantId);
  await calendlyRequest(token, "/invitee_cancellations", {
    method: "POST",
    body: JSON.stringify({
      invitee: meeting.calendlyInviteeUri,
      reason: params.reason || "Canceled from Bizosto",
    }),
  });

  await meetingRef.set(
    {
      status: "canceled",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function syncCalendlyEventsFromApi(tenantId: string, count = 20) {
  const integration = await getCalendlyIntegration(tenantId);
  if (!integration?.syncEnabled || !integration.userUri) throw new Error("Calendly sync is not enabled.");

  const token = await getCalendlyAccessToken(tenantId);
  const events = await calendlyRequest<{ collection?: unknown[] }>(
    token,
    `/scheduled_events?user=${encodeURIComponent(integration.userUri)}&count=${Math.min(Math.max(count, 1), 100)}&sort=start_time:desc`
  );

  const records: string[] = [];
  for (const entry of events.collection || []) {
    const invitees = await calendlyRequest<{ collection?: unknown[] }>(
      token,
      `/scheduled_events/${encodeURIComponent(String((entry as Record<string, unknown>).uri).split("/").pop() || "")}/invitees`
    );

    for (const invitee of invitees.collection || []) {
      const id = await upsertMeetingFromCalendlyWebhook({
        tenantId,
        payload: {
          event: "invitee.created",
          payload: {
            ...(invitee as Record<string, unknown>),
            event: {
              uri: (entry as Record<string, unknown>).uri,
              name: (entry as Record<string, unknown>).name,
              start_time: (entry as Record<string, unknown>).start_time,
              end_time: (entry as Record<string, unknown>).end_time,
              location: (entry as Record<string, unknown>).location,
            },
          },
        },
      });
      records.push(id);
    }
  }

  return { synced: records.length };
}
