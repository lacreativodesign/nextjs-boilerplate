import crypto from 'crypto';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebaseAdmin';
import { setPasswordEmailHtml, setPasswordEmailSubject } from '@/lib/email/html-templates';

const TOKEN_COLLECTION = 'password_setup_tokens';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_URL = 'https://app.bizosto.com';

export function hashSetPasswordToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
    .where('uid', '==', uid)
    .where('usedAt', '==', null)
    .get();

  if (!invalidationSnapshot.empty) {
    const batch = adminDb.batch();
    const invalidatedAt = now.toISOString();
    invalidationSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        usedAt: invalidatedAt,
        invalidatedAt,
        invalidatedBy: createdBy || null,
        invalidationReason: 'new_token_created',
      });
    });
    await batch.commit();
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  // Store only a SHA-256 hash of the token as the document ID. The raw token exists
  // solely in the emailed link, so Firestore reads, exports, and backups never expose
  // a usable credential (same pattern as user_invitations.tokenHash).
  await adminDb
    .collection(TOKEN_COLLECTION)
    .doc(hashSetPasswordToken(token))
    .set({
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
  isNewUser = true,
}: {
  email: string;
  link: string;
  isNewUser?: boolean;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[set-password] Resend not configured. Link:', link);
    return { sent: false, error: 'RESEND_API_KEY missing', link };
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: isNewUser ? 'Bizosto <no-reply@bizosto.com>' : 'Bizosto <support@bizosto.com>',
    to: email,
    subject: setPasswordEmailSubject(isNewUser),
    html: setPasswordEmailHtml({ email, setPasswordUrl: link, isNewUser }),
  });

  return { sent: true };
}

export function getTokenCollection() {
  return TOKEN_COLLECTION;
}
