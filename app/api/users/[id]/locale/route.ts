import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';
import { isSupportedLocale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  locale: z.string().trim().min(2).max(10),
});

function canManageUsers(role: string) {
  const normalized = normalizeRole(role);
  return (
    normalized === 'admin' ||
    normalized === 'super_admin' ||
    normalized === 'owner' ||
    normalized === 'manager'
  );
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (params.id !== me.uid && !canManageUsers(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid locale payload' }, { status: 400 });
    }

    if (!isSupportedLocale(parsed.data.locale)) {
      return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(params.id).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data() || {};
    if (userData.tenantId !== me.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await adminDb.collection('users').doc(params.id).update({
      locale: parsed.data.locale,
      language: parsed.data.locale,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, locale: parsed.data.locale });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save locale' }, { status: 500 });
  }
}
