import crypto from "crypto";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { queueEmail } from "@/lib/email";
import { normalizeTenantId } from "@/lib/tenant";

const INVITE_EXPIRY_DAYS = 7;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildInviteEmail({
  tenantId,
  email,
  token,
}: {
  tenantId: string;
  email: string;
  token: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const inviteUrl = `${baseUrl}/client/accept-invite?token=${token}`;
  const subject = "You are invited to the Bizosto client portal";
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#0f172a;">
      <h2>Welcome to Bizosto</h2>
      <p>Your client portal is ready. Click below to set your password and activate your account.</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Activate portal</a></p>
      <p>If the button doesn't work, copy this link into your browser:</p>
      <p>${inviteUrl}</p>
    </div>
  `;
  return { subject, html, inviteUrl, tenantId, email };
}

export async function createClientInvite({
  tenantId,
  email,
  clientId,
  createdByUid,
}: {
  tenantId: string;
  email: string;
  clientId: string;
  createdByUid?: string | null;
}) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  );

  const inviteRef = adminDb.collection("inviteTokens").doc();
  await inviteRef.set({
    tenantId: normalizedTenantId,
    tokenHash,
    email,
    clientId,
    expiresAt,
    usedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: createdByUid || null,
  });

  const { subject, html, inviteUrl } = buildInviteEmail({ tenantId: normalizedTenantId, email, token });
  await queueEmail({
    tenantId: normalizedTenantId,
    to: email,
    subject,
    html,
  });

  return { token, tokenHash, inviteId: inviteRef.id, inviteUrl };
}

export function hashInviteToken(token: string) {
  return hashToken(token);
}
