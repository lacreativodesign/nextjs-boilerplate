import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getValidGoogleAccessToken } from '@/lib/integrations/google-auth';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

function toBase64Url(input: string) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildRawEmail(params: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  threadId?: string;
  attachments?: Array<{ filename: string; mimeType: string; base64Content: string }>;
  trackingPixelUrl?: string;
}) {
  const boundaryMixed = `mix_${Date.now()}`;
  const boundaryAlt = `alt_${Date.now()}`;
  const htmlBody = `${params.html}${params.trackingPixelUrl ? `<img src=\"${params.trackingPixelUrl}\" alt=\"\" width=\"1\" height=\"1\" style=\"display:none;\" />` : ''}`;

  const headers = [
    `From: ${params.from}`,
    `To: ${params.to.join(', ')}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary=${boundaryMixed}`,
  ];

  const parts = [
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary=${boundaryAlt}`,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    params.text || params.html.replace(/<[^>]+>/g, ' '),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    `--${boundaryAlt}--`,
  ];

  for (const attachment of params.attachments || []) {
    parts.push(
      `--${boundaryMixed}`,
      `Content-Type: ${attachment.mimeType}; name=\"${attachment.filename}\"`,
      `Content-Disposition: attachment; filename=\"${attachment.filename}\"`,
      'Content-Transfer-Encoding: base64',
      '',
      attachment.base64Content,
    );
  }

  parts.push(`--${boundaryMixed}--`, '');
  return toBase64Url(`${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`);
}

async function gmailRequest<T>(tenantId: string, path: string, init: RequestInit = {}) {
  const token = await getValidGoogleAccessToken(tenantId);
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data?.error?.message || 'Gmail request failed.');
  return data;
}

export async function sendEmailViaGmail(params: {
  tenantId: string;
  actorUid: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  threadId?: string;
  attachments?: Array<{ filename: string; mimeType: string; base64Content: string }>;
  trackOpens?: boolean;
}) {
  const trackingRef = params.trackOpens
    ? adminDb
        .collection('tenants')
        .doc(params.tenantId)
        .collection('integrations')
        .doc('googleWorkspace')
        .collection('gmailTracking')
        .doc()
    : null;

  const trackingPixelUrl = trackingRef
    ? `${(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/integrations/google/gmail/open/${trackingRef.id}`
    : undefined;

  const raw = buildRawEmail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    threadId: params.threadId,
    attachments: params.attachments,
    trackingPixelUrl,
  });

  const sent = await gmailRequest<{ id: string; threadId: string; labelIds?: string[] }>(
    params.tenantId,
    '/users/me/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({ raw, threadId: params.threadId || undefined }),
    },
  );

  if (trackingRef) {
    await trackingRef.set({
      trackingId: trackingRef.id,
      messageId: sent.id,
      threadId: sent.threadId,
      openedAt: null,
      openCount: 0,
      createdBy: params.actorUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    messageId: sent.id,
    threadId: sent.threadId,
    trackingId: trackingRef?.id || null,
  };
}

export async function markTrackingOpen(trackingId: string) {
  const query = await adminDb
    .collectionGroup('gmailTracking')
    .where('trackingId', '==', trackingId)
    .limit(1)
    .get();
  if (query.empty) return false;
  await query.docs[0].ref.set(
    {
      openCount: admin.firestore.FieldValue.increment(1),
      openedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastOpenAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}
