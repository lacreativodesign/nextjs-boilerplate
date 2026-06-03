import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId } from "@/lib/tenant";

const SLACK_INTEGRATION_DOC = "slack";
const SLACK_STATE_COLLECTION = "slackOAuthStates";

export type SlackChannelMap = {
  invoicePaid: string | null;
  projectMilestone: string | null;
};

export type SlackIntegrationConfig = {
  tenantId: string;
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  botUserId: string | null;
  scopes: string[];
  defaultChannelId: string | null;
  channelMappings: SlackChannelMap;
  notifyTaskAssignedDm: boolean;
  notifyLeaveApprovedDm: boolean;
  commandEnabled: boolean;
  notificationEnabled: boolean;
  botTokenEncrypted: string | null;
  updatedAt?: FirebaseFirestore.FieldValue | string;
  updatedBy?: string;
};

type SlackOauthAccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  team?: { id?: string; name?: string };
  bot_user_id?: string;
};

type SlackCommandPayload = {
  command: string;
  text: string;
  user_id: string;
  user_name?: string;
  channel_id: string;
  team_id: string;
  response_url?: string;
};

function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function getEncryptionKey(): Buffer {
  const raw = String(process.env.SLACK_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("SLACK_TOKEN_ENCRYPTION_KEY is required for Slack token storage.");

  const candidate = raw.length === 64 && /^[a-fA-F0-9]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (candidate.length !== 32) throw new Error("SLACK_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  return candidate;
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

export function getSlackOAuthConfig() {
  const clientId = String(process.env.SLACK_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SLACK_CLIENT_SECRET || "").trim();
  const signingSecret = String(process.env.SLACK_SIGNING_SECRET || "").trim();
  if (!clientId || !clientSecret || !signingSecret) {
    throw new Error("SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_SIGNING_SECRET are required.");
  }

  return {
    clientId,
    clientSecret,
    signingSecret,
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    accessUrl: "https://slack.com/api/oauth.v2.access",
    redirectUri: `${getBaseUrl()}/api/integrations/slack/oauth`,
    botScopes: [
      "commands",
      "chat:write",
      "chat:write.customize",
      "channels:read",
      "groups:read",
      "im:write",
      "users:read",
      "users:read.email",
    ],
  };
}

export async function getSlackIntegration(tenantId: string): Promise<SlackIntegrationConfig | null> {
  const snap = await adminDb.collection("tenants").doc(tenantId).collection("integrations").doc(SLACK_INTEGRATION_DOC).get();
  if (!snap.exists) return null;
  return snap.data() as SlackIntegrationConfig;
}

export function buildSlackInstallUrl(state: string) {
  const config = getSlackOAuthConfig();
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", config.botScopes.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  return url.toString();
}

export async function createSlackOAuthState(params: { tenantId: string; userUid: string; returnTo?: string }) {
  const state = crypto.randomBytes(24).toString("base64url");
  await adminDb.collection(SLACK_STATE_COLLECTION).doc(state).set({
    state,
    tenantId: params.tenantId,
    userUid: params.userUid,
    returnTo: params.returnTo || "/admin/settings/integrations",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60_000),
  });
  return state;
}

export async function consumeSlackOAuthState(state: string) {
  const ref = adminDb.collection(SLACK_STATE_COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invalid Slack OAuth state.");
  const data = snap.data() as any;
  if (!data?.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error("Slack OAuth state expired.");
  }
  await ref.delete();
  return data as { tenantId: string; userUid: string; returnTo: string };
}

export async function exchangeSlackCodeForAccess(code: string): Promise<SlackOauthAccessResponse> {
  const config = getSlackOAuthConfig();
  const response = await fetch(config.accessUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as SlackOauthAccessResponse;
  if (!response.ok || !data.ok || !data.access_token) {
    throw new Error(data.error || "Slack OAuth exchange failed.");
  }

  return data;
}

export async function saveSlackInstallation(params: {
  tenantId: string;
  userUid: string;
  accessToken: string;
  scopes: string[];
  teamId: string | null;
  teamName: string | null;
  botUserId: string | null;
}) {
  await adminDb
    .collection("tenants")
    .doc(params.tenantId)
    .collection("integrations")
    .doc(SLACK_INTEGRATION_DOC)
    .set(
      {
        tenantId: params.tenantId,
        connected: true,
        teamId: params.teamId,
        teamName: params.teamName,
        botUserId: params.botUserId,
        scopes: params.scopes,
        defaultChannelId: null,
        channelMappings: {
          invoicePaid: null,
          projectMilestone: null,
        },
        notifyTaskAssignedDm: true,
        notifyLeaveApprovedDm: true,
        commandEnabled: true,
        notificationEnabled: true,
        botTokenEncrypted: encrypt(params.accessToken),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: params.userUid,
      } satisfies SlackIntegrationConfig,
      { merge: true }
    );
}

export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const requestTs = Number(timestamp);
  if (!Number.isFinite(requestTs) || Math.abs(nowSeconds - requestTs) > 60 * 5) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", getSlackOAuthConfig().signingSecret).update(baseString).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function callSlackApi<T>(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Slack API ${method} failed.`);
  }
  return data;
}

async function getTenantFromSlackTeam(teamId: string): Promise<{ tenantId: string; config: SlackIntegrationConfig } | null> {
  const snap = await adminDb
    .collectionGroup("integrations")
    .where(admin.firestore.FieldPath.documentId(), "==", SLACK_INTEGRATION_DOC)
    .where("teamId", "==", teamId)
    .where("connected", "==", true)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  const tenantRef = doc.ref.parent.parent;
  if (!tenantRef) return null;
  return { tenantId: tenantRef.id, config: doc.data() as SlackIntegrationConfig };
}

async function getBotToken(config: SlackIntegrationConfig): Promise<string> {
  if (!config.botTokenEncrypted) throw new Error("Slack bot token missing.");
  return decrypt(config.botTokenEncrypted);
}

export async function sendChannelMessage(params: {
  tenantId: string;
  channelId: string;
  text: string;
  blocks?: unknown[];
  attachments?: unknown[];
}) {
  const config = await getSlackIntegration(params.tenantId);
  if (!config?.connected || !config.notificationEnabled) return;
  const token = await getBotToken(config);
  await callSlackApi(token, "chat.postMessage", {
    channel: params.channelId,
    text: params.text,
    blocks: params.blocks,
    attachments: params.attachments,
  });
}

export async function sendDirectMessage(params: { tenantId: string; slackUserId: string; text: string; blocks?: unknown[] }) {
  const config = await getSlackIntegration(params.tenantId);
  if (!config?.connected || !config.notificationEnabled) return;
  const token = await getBotToken(config);
  const convo = await callSlackApi<{ channel: { id: string } }>(token, "conversations.open", { users: params.slackUserId });
  await callSlackApi(token, "chat.postMessage", {
    channel: convo.channel.id,
    text: params.text,
    blocks: params.blocks,
  });
}

async function getSlackUserForBizostoUser(tenantId: string, userId: string): Promise<string | null> {
  const userSnap = await adminDb.collection("users").doc(userId).get();
  if (!userSnap.exists) return null;
  const data = userSnap.data() || {};
  if (docTenantId(data) !== tenantId) return null;
  return typeof data.slackUserId === "string" && data.slackUserId ? data.slackUserId : null;
}

export function buildApprovalMessage(params: { title: string; description: string; approveValue: string; rejectValue: string }) {
  return {
    text: params.title,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${params.title}*\n${params.description}` } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "Approve" },
            action_id: "bizosto_approve",
            value: params.approveValue,
          },
          {
            type: "button",
            style: "danger",
            text: { type: "plain_text", text: "Reject" },
            action_id: "bizosto_reject",
            value: params.rejectValue,
          },
        ],
      },
    ],
  };
}

export async function sendBizostoEventNotification(params:
  | { type: "task_assigned"; tenantId: string; targetUserId: string; title: string; projectId: string }
  | { type: "invoice_paid"; tenantId: string; invoiceNumber: string; amountLabel: string }
  | { type: "project_milestone"; tenantId: string; projectName: string; milestoneName: string }
  | { type: "leave_approved"; tenantId: string; targetUserId: string; leaveType: string }) {
  const config = await getSlackIntegration(params.tenantId);
  if (!config?.connected || !config.notificationEnabled) return;

  if (params.type === "task_assigned" && config.notifyTaskAssignedDm) {
    const slackUserId = await getSlackUserForBizostoUser(params.tenantId, params.targetUserId);
    if (slackUserId) {
      await sendDirectMessage({
        tenantId: params.tenantId,
        slackUserId,
        text: `New task assigned: ${params.title}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*New Task Assigned*\n${params.title}` } },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Open Task" },
                url: `${getBaseUrl()}/dashboard/projects/${params.projectId}`,
              },
            ],
          },
        ],
      });
    }
    return;
  }

  if (params.type === "leave_approved" && config.notifyLeaveApprovedDm) {
    const slackUserId = await getSlackUserForBizostoUser(params.tenantId, params.targetUserId);
    if (slackUserId) {
      await sendDirectMessage({
        tenantId: params.tenantId,
        slackUserId,
        text: `Your ${params.leaveType} leave was approved.`,
      });
    }
    return;
  }

  if (params.type === "invoice_paid") {
    const channelId = config.channelMappings?.invoicePaid || config.defaultChannelId;
    if (!channelId) return;
    await sendChannelMessage({
      tenantId: params.tenantId,
      channelId,
      text: `Invoice paid: ${params.invoiceNumber} (${params.amountLabel})`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `:moneybag: *Invoice Paid*\nInvoice: *${params.invoiceNumber}*\nAmount: *${params.amountLabel}*` },
        },
      ],
    });
    return;
  }

  if (params.type === "project_milestone") {
    const channelId = config.channelMappings?.projectMilestone || config.defaultChannelId;
    if (!channelId) return;
    await sendChannelMessage({
      tenantId: params.tenantId,
      channelId,
      text: `Milestone completed: ${params.projectName} / ${params.milestoneName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:dart: *Project Milestone Completed*\nProject: *${params.projectName}*\nMilestone: *${params.milestoneName}*`,
          },
        },
      ],
    });
  }
}

function parseKvArgs(raw: string) {
  const output: Record<string, string> = {};
  const pattern = /(\w+)="([^"]+)"|(\w+)=([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const key = (match[1] || match[3] || "").toLowerCase();
    const value = (match[2] || match[4] || "").trim();
    if (key && value) output[key] = value;
  }
  return output;
}

async function resolveBizostoUserBySlack(tenantId: string, slackUserId: string) {
  const snap = await adminDb.collection("users").where("tenantId", "==", tenantId).where("slackUserId", "==", slackUserId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() || {};
  return { uid: doc.id, displayName: String(data.name || data.fullName || data.email || doc.id) };
}

export async function handleSlackSlashCommand(payload: SlackCommandPayload) {
  const match = await getTenantFromSlackTeam(payload.team_id);
  if (!match) {
    return { response_type: "ephemeral", text: "Bizosto workspace is not connected for this Slack workspace." };
  }

  if (match.config.commandEnabled === false) {
    return { response_type: "ephemeral", text: "Slash commands are disabled by your Bizosto admin." };
  }

  const text = (payload.text || "").trim();
  const [entity = "", action = "", ...rest] = text.split(/\s+/);
  const command = `${entity.toLowerCase()} ${action.toLowerCase()}`.trim();
  const args = rest.join(" ").trim();

  switch (command) {
    case "task create": {
      const kv = parseKvArgs(args);
      const projectId = kv.project || kv.projectid;
      const title = kv.title;
      if (!projectId || !title) return { response_type: "ephemeral", text: "Usage: /bizosto task create project=<projectId> title=\"Task title\" [priority=medium] [assigned=<userId>]" };

      const projectSnap = await adminDb.collection("projects").doc(projectId).get();
      if (!projectSnap.exists) return { response_type: "ephemeral", text: `Project ${projectId} not found.` };
      const project = projectSnap.data() as any;
      if (project.tenantId !== match.tenantId) return { response_type: "ephemeral", text: "Project is not in your tenant." };

      const requester = await resolveBizostoUserBySlack(match.tenantId, payload.user_id);
      if (!requester) return { response_type: "ephemeral", text: "Link your Slack user to Bizosto profile (slackUserId) before using commands." };

      const now = admin.firestore.Timestamp.now();
      const taskRef = adminDb.collection("tasks").doc();
      await taskRef.set({
        tenantId: match.tenantId,
        projectId,
        projectName: String(project.name || project.projectName || projectId),
        title,
        description: kv.description || null,
        status: "todo",
        priority: ["low", "medium", "high", "urgent"].includes(String(kv.priority || "").toLowerCase()) ? String(kv.priority).toLowerCase() : "medium",
        assignedTo: kv.assigned || null,
        assignedBy: requester.uid,
        assignedByName: requester.displayName,
        progress: 0,
        tags: [],
        dependsOn: [],
        blockedBy: [],
        hasSubtasks: false,
        parentTaskId: null,
        attachments: [],
        commentCount: 0,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await adminDb.collection("projects").doc(projectId).set({ totalTasks: admin.firestore.FieldValue.increment(1), updatedAt: now }, { merge: true });
      return { response_type: "ephemeral", text: `Task created: ${title}` };
    }
    case "invoice status": {
      if (!args) return { response_type: "ephemeral", text: "Usage: /bizosto invoice status <invoice-number>" };

      const [byOrder, byId] = await Promise.all([
        adminDb.collection("invoices").where("tenantId", "==", match.tenantId).where("orderId", "==", args).limit(1).get(),
        adminDb.collection("invoices").where("tenantId", "==", match.tenantId).where(admin.firestore.FieldPath.documentId(), "==", args).limit(1).get(),
      ]);
      const found = byOrder.empty ? byId : byOrder;
      if (found.empty) return { response_type: "ephemeral", text: `Invoice ${args} not found.` };

      const invoice = found.docs[0].data() as any;
      return { response_type: "ephemeral", text: `Invoice ${args}: ${invoice.status || "unknown"}` };
    }
    case "leave request": {
      const kv = parseKvArgs(args);
      const leaveType = kv.type || "vacation";
      const startDateRaw = kv.start;
      const endDateRaw = kv.end || kv.start;
      if (!startDateRaw || !endDateRaw) return { response_type: "ephemeral", text: "Usage: /bizosto leave request type=<type> start=YYYY-MM-DD end=YYYY-MM-DD [reason=\"text\"]" };
      const startDate = new Date(startDateRaw);
      const endDate = new Date(endDateRaw);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return { response_type: "ephemeral", text: "Invalid leave dates." };

      const requester = await resolveBizostoUserBySlack(match.tenantId, payload.user_id);
      if (!requester) return { response_type: "ephemeral", text: "Link your Slack user to Bizosto profile (slackUserId) before using commands." };

      const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const leaveRef = adminDb.collection("hr_leave_requests").doc();
      await leaveRef.set({
        tenantId: match.tenantId,
        employeeId: requester.uid,
        employeeName: requester.displayName,
        leaveType,
        policyId: null,
        startDate,
        endDate,
        totalDays,
        totalHours: totalDays * 8,
        reason: kv.reason || null,
        status: "pending",
        reviewerId: null,
        reviewerName: null,
        reviewedAt: null,
        rejectionReason: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "slack_command",
      });

      return { response_type: "ephemeral", text: `Leave request submitted (${leaveRef.id}).` };
    }
    case "project status": {
      const projectSnap = await adminDb.collection("projects").where("tenantId", "==", match.tenantId).orderBy("updatedAt", "desc").limit(5).get();
      const lines = projectSnap.docs.map((d) => {
        const p = d.data() as any;
        return `• ${p.name || p.projectName || d.id} — ${p.status || "active"} (${p.progress ?? 0}% progress)`;
      });
      return { response_type: "ephemeral", text: lines.length ? lines.join("\n") : "No projects found." };
    }
    case "help":
    default:
      return { response_type: "ephemeral", text: "Bizosto commands: /bizosto task create, /bizosto invoice status, /bizosto leave request, /bizosto project status" };
  }
}

export async function updateSlackInteractiveAction(params: { teamId: string; actionId: string; value: string; actorSlackUserId: string }) {
  const match = await getTenantFromSlackTeam(params.teamId);
  if (!match) {
    throw new Error("No tenant linked to this Slack workspace.");
  }

  const [entity, id] = params.value.split(":");
  if (entity === "leave" && id) {
    const reqRef = adminDb.collection("hr_leave_requests").doc(id);
    await adminDb.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error("Leave request not found.");
      const req = reqSnap.data() || {};
      if (req.tenantId !== match.tenantId) throw new Error("Forbidden.");
      if (req.status !== "pending") throw new Error("Leave request is already processed.");

      const approved = params.actionId === "bizosto_approve";
      tx.update(reqRef, {
        status: approved ? "approved" : "rejected",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewerId: null,
        reviewerName: "Slack Approver",
        rejectionReason: approved ? null : "Rejected via Slack",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        slackAction: {
          actorSlackUserId: params.actorSlackUserId,
          actionId: params.actionId,
          status: approved ? "approved" : "rejected",
          actedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });

      if (req.leaveType !== "unpaid") {
        const startDate = req.startDate?.toDate ? req.startDate.toDate() : new Date(req.startDate);
        const year = startDate.getUTCFullYear();
        const balanceRef = adminDb.collection("hr_leave_balances").doc(`${match.tenantId}_${req.employeeId}_${req.leaveType}_${year}`);
        const balanceSnap = await tx.get(balanceRef);
        const balance = balanceSnap.data() || {};
        const totalHours = Number(req.totalHours || 0);
        if (approved) {
          tx.set(balanceRef, {
            tenantId: match.tenantId,
            employeeId: req.employeeId,
            leaveType: req.leaveType,
            year,
            usedHours: Number(balance.usedHours || 0) + totalHours,
            pendingHours: Math.max(0, Number(balance.pendingHours || 0) - totalHours),
            availableHours: Number(balance.availableHours || 0),
            accruedHours: Number(balance.accruedHours || 0),
            carryOverHours: Number(balance.carryOverHours || 0),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } else if (balanceSnap.exists) {
          tx.update(balanceRef, {
            pendingHours: Math.max(0, Number(balance.pendingHours || 0) - totalHours),
            availableHours: Number(balance.availableHours || 0) + totalHours,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });
  }

  return {
    text: params.actionId === "bizosto_approve" ? "Request approved in Bizosto." : "Request rejected in Bizosto.",
    replace_original: false,
  };
}
