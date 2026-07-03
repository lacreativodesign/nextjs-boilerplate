import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  DEFAULT_FINANCE_SETTINGS,
  canEditSection,
  parseBoolean,
  parseNumber,
  parseNumberArray,
  parseString,
  parseStringArray,
  parseLateFeesSettings,
  requireAdmin,
  serverTimestamp,
  toISO,
  logSettingsChange,
} from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ORDER_PREFIX_PATTERN = /^[A-Z0-9-]{0,10}$/;

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    // Tenant-scoped settings doc. Falls back to the legacy global "finance" doc
    // (read-only) for tenants whose settings have not yet been migrated.
    const financeDocId = `${auth.user.tenantId}_finance`;
    const [snap, legacySnap, tenantSnap, invoiceCounterSnap] = await Promise.all([
      adminDb.collection('settings').doc(financeDocId).get(),
      adminDb.collection('settings').doc('finance').get(),
      adminDb.collection('tenants').doc(auth.user.tenantId).get(),
      adminDb
        .collection('tenants')
        .doc(auth.user.tenantId)
        .collection('counters')
        .doc('invoices')
        .get(),
    ]);
    const data = snap.exists ? snap.data() : legacySnap.exists ? legacySnap.data() : {};
    const tenantData = tenantSnap.exists ? tenantSnap.data() : {};
    const invoiceCounter = Number(invoiceCounterSnap.data()?.value || 0);

    const settings = {
      invoicePrefix: parseString(data?.invoicePrefix, DEFAULT_FINANCE_SETTINGS.invoicePrefix),
      invoiceCounter: parseNumber(data?.invoiceCounter, DEFAULT_FINANCE_SETTINGS.invoiceCounter),
      paymentMethods: parseStringArray(data?.paymentMethods),
      arBuckets: parseNumberArray(data?.arBuckets, DEFAULT_FINANCE_SETTINGS.arBuckets),
      payrollApprovalRequired: parseBoolean(
        data?.payrollApprovalRequired,
        DEFAULT_FINANCE_SETTINGS.payrollApprovalRequired,
      ),
      lockPastMonths: parseBoolean(data?.lockPastMonths, DEFAULT_FINANCE_SETTINGS.lockPastMonths),
      fxPkrPerUsd: parseNumber(data?.fxPkrPerUsd, DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd),
      lateFeesSettings: parseLateFeesSettings(data?.lateFeesSettings),
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
      orderPrefix: parseString(tenantData?.orderPrefix, '').trim().toUpperCase(),
      orderStartingNumber: Math.max(1, parseNumber(tenantData?.orderStartingNumber, 1)),
      canEditOrderStartingNumber: invoiceCounter <= 0,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, 'finance'),
      role: auth.user.role,
    });
  } catch (err) {
    console.error('settings/finance get error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, 'finance')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const orderPrefix = parseString(body?.orderPrefix, '').trim().toUpperCase();
    if (!ORDER_PREFIX_PATTERN.test(orderPrefix)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Invoice Number Prefix must be 10 characters max using only letters, numbers, and hyphens.',
        },
        { status: 400 },
      );
    }
    const requestedStartingNumber = Math.max(
      1,
      Math.floor(parseNumber(body?.orderStartingNumber, 1)),
    );
    const payload = {
      invoicePrefix: parseString(body?.invoicePrefix, DEFAULT_FINANCE_SETTINGS.invoicePrefix),
      invoiceCounter: parseNumber(body?.invoiceCounter, DEFAULT_FINANCE_SETTINGS.invoiceCounter),
      paymentMethods: parseStringArray(body?.paymentMethods),
      arBuckets: parseNumberArray(body?.arBuckets, DEFAULT_FINANCE_SETTINGS.arBuckets),
      payrollApprovalRequired: parseBoolean(
        body?.payrollApprovalRequired,
        DEFAULT_FINANCE_SETTINGS.payrollApprovalRequired,
      ),
      lockPastMonths: parseBoolean(body?.lockPastMonths, DEFAULT_FINANCE_SETTINGS.lockPastMonths),
      fxPkrPerUsd: parseNumber(body?.fxPkrPerUsd, DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd),
      lateFeesSettings: parseLateFeesSettings(body?.lateFeesSettings),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };
    const invoiceCounterSnap = await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection('counters')
      .doc('invoices')
      .get();
    const invoiceCounter = Number(invoiceCounterSnap.data()?.value || 0);
    const tenantPatch: Record<string, unknown> = {
      orderPrefix,
      updatedAt: serverTimestamp(),
    };
    if (invoiceCounter <= 0) {
      tenantPatch.orderStartingNumber = requestedStartingNumber;
    }

    await Promise.all([
      adminDb
        .collection('settings')
        .doc(`${auth.user.tenantId}_finance`)
        .set(payload, { merge: true }),
      adminDb.collection('tenants').doc(auth.user.tenantId).set(tenantPatch, { merge: true }),
    ]);

    await logSettingsChange({
      user: auth.user,
      section: 'finance',
      summary: 'Finance settings updated.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('settings/finance update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
