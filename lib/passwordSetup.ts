import crypto from "crypto";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebaseAdmin";

const TOKEN_COLLECTION = "password_setup_tokens";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_URL = "https://app.bizosto.com";

export function buildSetPasswordLink(token: string) {
  return `${DASHBOARD_URL}/set-password?token=${token}`;
}

export async function createPasswordSetupToken({
  uid,
  email,
  createdBy,
}: {
  uid: string;
  email: string;
  createdBy?: string | null;
}) {
  const now = new Date();
  const invalidationSnapshot = await adminDb
    .collection(TOKEN_COLLECTION)
    .where("uid", "==", uid)
    .where("usedAt", "==", null)
    .get();

  if (!invalidationSnapshot.empty) {
    const batch = adminDb.batch();
    const invalidatedAt = now.toISOString();
    invalidationSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        usedAt: invalidatedAt,
        invalidatedAt,
        invalidatedBy: createdBy || null,
        invalidationReason: "new_token_created",
      });
    });
    await batch.commit();
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await adminDb.collection(TOKEN_COLLECTION).doc(token).set({
    token,
    uid,
    email,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
    createdBy: createdBy || null,
  });

  return {
    token,
    link: buildSetPasswordLink(token),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function sendSetPasswordEmail({
  email,
  link,
}: {
  email: string;
  link: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("[set-password] Resend not configured. Link:", link);
    return { sent: false, error: "RESEND_API_KEY missing", link };
  }

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <h2 style="margin: 0 0 12px;">Set your BIZOSTO Dashboard password</h2>
      <p style="margin: 0 0 16px;">Welcome to BIZOSTO ERP. Click the button below to set your password.</p>
      <p style="margin: 0 0 20px;">
        <a href="${link}" style="display: inline-block; padding: 12px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Set Password
        </a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">This link expires in 24 hours.</p>
    </div>
  `;

  await resend.emails.send({
    from: "Bizosto <no-reply@bizosto.com>",
    to: email,
    subject: "Set your BIZOSTO Dashboard password",
    html,
  });

  return { sent: true };
}

export function getTokenCollection() {
  return TOKEN_COLLECTION;
}
