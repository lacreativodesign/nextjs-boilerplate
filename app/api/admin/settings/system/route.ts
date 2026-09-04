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

const SUPPORTED_CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'CHF',
  'JPY',
  'CNY',
  'INR',
  'AED',
  'SAR',
  'SGD',
  'MYR',
  'ZAR',
  'BRL',
  'MXN',
  'NGN',
  'EGP',
]);

function normalizeCurrency(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantSnap = await adminDb.collection('tenants').doc(auth.user.tenantId).get();
    const tenantData = tenantSnap.data() || {};
    const tenantCurrency = normalizeCurrency(tenantData.settings?.currency) || 'USD';
    const tenantName = String(tenantData.name || '').trim();
    const currencyLockedAt = tenantData.currencyLockedAt || null;

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
      currencyLocked: Boolean(currencyLockedAt),
      currencyLockedAt: toISO(currencyLockedAt),
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
    const tenantRef = adminDb.collection('tenants').doc(auth.user.tenantId);
    const requestedCurrency = normalizeCurrency(body?.currency ?? body?.revenueCurrency);

    if (requestedCurrency && !SUPPORTED_CURRENCIES.has(requestedCurrency)) {
      return NextResponse.json(
        { ok: false, error: 'Unsupported workspace currency.', code: 'invalid_currency' },
        { status: 400 },
      );
    }

    const currencyDecision = await adminDb.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        return { ok: false as const, code: 'tenant_not_found' as const };
      }

      const tenantData = tenantSnap.data() || {};
      const currentCurrency = normalizeCurrency(tenantData.settings?.currency) || 'USD';
      const currencyLocked = Boolean(tenantData.currencyLockedAt);

      if (currencyLocked && requestedCurrency && requestedCurrency !== currentCurrency) {
        return {
          ok: false as const,
          code: 'currency_locked' as const,
          currentCurrency,
        };
      }

      const currencyChanged =
        !currencyLocked && Boolean(requestedCurrency) && requestedCurrency !== currentCurrency;
      if (currencyChanged) {
        tx.update(tenantRef, {
          'settings.currency': requestedCurrency,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        ok: true as const,
        currentCurrency,
        effectiveCurrency: requestedCurrency || currentCurrency,
        currencyLocked,
        currencyChanged,
      };
    });

    if (!currencyDecision.ok) {
      if (currencyDecision.code === 'tenant_not_found') {
        return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            'Workspace currency is locked after activation because all financial records share one base currency.',
          code: 'currency_locked',
          currency: currencyDecision.currentCurrency,
        },
        { status: 409 },
      );
    }

    const currentCurrency = currencyDecision.currentCurrency;
    const currencyLocked = currencyDecision.currencyLocked;

    const payload = {
      companyName: parseString(body?.companyName, DEFAULT_SYSTEM_SETTINGS.companyName),
      timezone: parseString(body?.timezone, DEFAULT_SYSTEM_SETTINGS.timezone),
      dateFormat: parseString(body?.dateFormat, DEFAULT_SYSTEM_SETTINGS.dateFormat),
      workingDays: parseStringArray(body?.workingDays),
      workingHours: {
        start: parseString(body?.workingHours?.start, DEFAULT_SYSTEM_SETTINGS.workingHours.start),
        end: parseString(body?.workingHours?.end, DEFAULT_SYSTEM_SETTINGS.workingHours.end),
      },
      fiscalMonthStart: parseNumber(
        body?.fiscalMonthStart,
        DEFAULT_SYSTEM_SETTINGS.fiscalMonthStart,
      ),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await tenantRef.collection('settings').doc('system').set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: 'system',
      summary: currencyDecision.currencyChanged
        ? `System settings updated; base currency changed from ${currentCurrency} to ${currencyDecision.effectiveCurrency} before activation.`
        : 'System settings updated.',
    });

    return NextResponse.json({
      ok: true,
      currency: currencyDecision.effectiveCurrency,
      currencyLocked,
    });
  } catch (err) {
    console.error('settings/system update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
