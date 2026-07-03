import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  DEFAULT_SYSTEM_SETTINGS,
  canEditSection,
  parseNumber,
  parseString,
  parseStringArray,
  requireAdmin,
  serverTimestamp,
  toISO,
  logSettingsChange,
} from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantSnap = await adminDb.collection('tenants').doc(auth.user.tenantId).get();
    const tenantCurrency = String(tenantSnap.data()?.settings?.currency || 'USD').trim() || 'USD';
    const tenantName = String(tenantSnap.data()?.name || '').trim();

    const snap = await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection('settings')
      .doc('system')
      .get();
    const data = snap.exists ? snap.data() : {};

    const settings = {
      companyName: parseString(
        data?.companyName,
        tenantName || DEFAULT_SYSTEM_SETTINGS.companyName,
      ),
      timezone: parseString(data?.timezone, DEFAULT_SYSTEM_SETTINGS.timezone),
      dateFormat: parseString(data?.dateFormat, DEFAULT_SYSTEM_SETTINGS.dateFormat),
      workingDays: parseStringArray(data?.workingDays),
      workingHours: {
        start: parseString(data?.workingHours?.start, DEFAULT_SYSTEM_SETTINGS.workingHours.start),
        end: parseString(data?.workingHours?.end, DEFAULT_SYSTEM_SETTINGS.workingHours.end),
      },
      revenueCurrency: tenantCurrency,
      expenseCurrency: tenantCurrency,
      fiscalMonthStart: parseNumber(
        data?.fiscalMonthStart,
        DEFAULT_SYSTEM_SETTINGS.fiscalMonthStart,
      ),
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, 'system'),
      role: auth.user.role,
    });
  } catch (err) {
    console.error('settings/system get error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, 'system')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = {
      companyName: parseString(body?.companyName, DEFAULT_SYSTEM_SETTINGS.companyName),
      timezone: parseString(body?.timezone, DEFAULT_SYSTEM_SETTINGS.timezone),
      dateFormat: parseString(body?.dateFormat, DEFAULT_SYSTEM_SETTINGS.dateFormat),
      workingDays: parseStringArray(body?.workingDays),
      workingHours: {
        start: parseString(body?.workingHours?.start, DEFAULT_SYSTEM_SETTINGS.workingHours.start),
        end: parseString(body?.workingHours?.end, DEFAULT_SYSTEM_SETTINGS.workingHours.end),
      },
      revenueCurrency: parseString(body?.revenueCurrency, 'USD'),
      expenseCurrency: parseString(body?.revenueCurrency, 'USD'),
      fiscalMonthStart: parseNumber(
        body?.fiscalMonthStart,
        DEFAULT_SYSTEM_SETTINGS.fiscalMonthStart,
      ),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection('settings')
      .doc('system')
      .set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: 'system',
      summary: 'System settings updated.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('settings/system update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
