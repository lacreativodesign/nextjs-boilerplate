import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getValidMicrosoftAccessToken } from '@/lib/integrations/microsoft-auth';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

async function outlookRequest<T>(
  tenantId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getValidMicrosoftAccessToken(tenantId);
  const response = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || 'Outlook request failed.');
  return data;
}

export async function sendEmailViaOutlook(params: {
  tenantId: string;
  actorUid: string;
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  threadId?: string;
  attachments?: Array<{ filename: string; mimeType: string; base64Content: string }>;
  trackOpens?: boolean;
}) {
  const trackingRef = params.trackOpens
    ? adminDb
        .collection('tenants')
        .doc(params.tenantId)
        .collection('integrations')
        .doc('microsoft365')
        .collection('outlookTracking')
        .doc()
    : null;

  const trackingPixelUrl = trackingRef
    ? `${(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/integrations/microsoft/outlook/open/${trackingRef.id}`
    : '';

  const htmlWithTracking = trackingPixelUrl
    ? `${params.html}<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none;" />`
    : params.html;

  await outlookRequest<unknown>(params.tenantId, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: 'HTML', content: htmlWithTracking },
        toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: (params.cc || []).map((address) => ({ emailAddress: { address } })),
        bccRecipients: (params.bcc || []).map((address) => ({ emailAddress: { address } })),
        internetMessageHeaders: params.threadId
          ? [{ name: 'X-Bizosto-Thread-Id', value: params.threadId }]
          : undefined,
        attachments: (params.attachments || []).map((attachment) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.filename,
          contentType: attachment.mimeType,
          contentBytes: attachment.base64Content,
        })),
      },
      saveToSentItems: true,
    }),
  });

  if (trackingRef) {
    await trackingRef.set({
      trackingId: trackingRef.id,
      threadId: params.threadId || null,
      openedAt: null,
      openCount: 0,
      createdBy: params.actorUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    threadId: params.threadId || null,
    trackingId: trackingRef?.id || null,
  };
}

export async function markOutlookTrackingOpen(trackingId: string) {
  const query = await adminDb
    .collectionGroup('outlookTracking')
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
