import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../_utils';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULTS = {
  allowPublicSignup: true,
  maintenanceMode: false,
  maintenanceMessage: 'Bizosto is undergoing scheduled maintenance. Back soon.',
  defaultTrialDays: 14,
  supportEmail: 'support@bizosto.com',
  platformName: 'Bizosto',
  announcementEnabled: false,
  announcementMessage: '',
  announcementType: 'info',
  maxUsersStarter: 10,
  maxUsersPro: 50,
  maxUsersEnterprise: 999,
};

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const snap = await adminDb.collection('settings').doc('platform').get();
    const data = snap.exists ? snap.data() : {};
    return NextResponse.json({ ok: true, settings: { ...DEFAULTS, ...data } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof body.allowPublicSignup === 'boolean')
      payload.allowPublicSignup = body.allowPublicSignup;
    if (typeof body.maintenanceMode === 'boolean') payload.maintenanceMode = body.maintenanceMode;
    if (typeof body.announcementEnabled === 'boolean')
      payload.announcementEnabled = body.announcementEnabled;
    if (typeof body.maintenanceMessage === 'string')
      payload.maintenanceMessage = body.maintenanceMessage.trim();
    if (typeof body.announcementMessage === 'string')
      payload.announcementMessage = body.announcementMessage.trim();
    if (typeof body.announcementType === 'string') payload.announcementType = body.announcementType;
    if (typeof body.defaultTrialDays === 'number')
      payload.defaultTrialDays = Math.max(1, Math.min(90, body.defaultTrialDays));
    if (typeof body.supportEmail === 'string') payload.supportEmail = body.supportEmail.trim();
    if (typeof body.platformName === 'string') payload.platformName = body.platformName.trim();
    await adminDb.collection('settings').doc('platform').set(payload, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
