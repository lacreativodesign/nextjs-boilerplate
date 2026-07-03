import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient } from '../../_utils';
import { createNotification, createNotificationEvent } from '@/lib/notifications';

export const runtime = 'nodejs';

function cleanString(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const changeRequestId = cleanString(body?.changeRequestId);
    const message = cleanString(body?.message);
    if (!changeRequestId || !message) {
      return NextResponse.json({ ok: false, error: 'Message is required.' }, { status: 400 });
    }

    const ref = adminDb.collection('changeRequests').doc(changeRequestId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Change request not found.' }, { status: 404 });
    }

    const data = snap.data() || {};
    if (String(data.tenantId || '') !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (String(data.clientId || '') !== auth.clientId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const commentRef = ref.collection('comments').doc();
    await commentRef.set({
      id: commentRef.id,
      body: message,
      createdAt: now,
      createdByUid: auth.user.uid,
      createdByRole: 'client',
    });

    await ref.set({ updatedAt: now }, { merge: true });

    if (data.assignedToUid) {
      await createNotification({
        toUserId: String(data.assignedToUid),
        title: 'Client comment added',
        body: message.slice(0, 160),
        type: 'info',
        entityType: 'change_request',
        entityId: changeRequestId,
        deepLink: '/am/change-requests',
        createdBy: {
          uid: auth.user.uid,
          name: auth.user.name || auth.user.fullName || auth.user.displayName || '',
        },
      });
    }

    await createNotificationEvent({
      type: 'change_request.client_commented',
      title: 'Client comment added',
      description: message.slice(0, 240),
      entityType: 'change_request',
      entityId: changeRequestId,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || auth.user.displayName || '',
      metadata: {
        clientId: auth.clientId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('client/change-requests comment error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to add comment.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
