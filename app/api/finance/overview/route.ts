import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireFinance, toISO } from '../_utils';
import { normalizeInvoiceStatus, normalizePaymentStatus } from '@/lib/finance/status';
import { getRedisClient } from '@/lib/cache/redis-client';

export const dynamic = 'force-dynamic';

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toMillis(value: any) {
  const iso = toISO(value);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    const redis = await getRedisClient();
    const cacheKey = `overview:finance:${auth.user.tenantId}`;
    const cached = redis ? await redis.get(cacheKey) : null;
    if (cached) return NextResponse.json(JSON.parse(String(cached)));

    const now = new Date();
    const startOfMonth = getStartOfMonth(now);
    const startMs = startOfMonth.getTime();

    const [invoiceSnap, paymentSnap, payrollSnap, expenseSnap, eventsSnap] = await Promise.all([
      adminDb
        .collection('invoices')
        .where('tenantId', '==', auth.user.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      adminDb
        .collection('payments')
        .where('tenantId', '==', auth.user.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      adminDb
        .collection('payroll')
        .where('tenantId', '==', auth.user.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      adminDb
        .collection('expenses')
        .where('tenantId', '==', auth.user.tenantId)
        .where('isDeleted', '==', false)
        .limit(500)
        .get(),
      adminDb
        .collection('events')
        .where('tenantId', '==', auth.user.tenantId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get(),
    ]);

    type DocRecord = { id: string } & Record<string, any>;
    const invoices = invoiceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];
    const payments = paymentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];
    const payroll = payrollSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];
    const expenses = expenseSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];

    const totalRevenueMonth = invoices.reduce((sum, inv) => {
      const status = normalizeInvoiceStatus(inv.status);
      if (status !== 'paid') return sum;
      const paidMs = toMillis(inv.paidAt || inv.updatedAt || inv.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      return sum + Number(inv.amountTotalUsd || 0);
    }, 0);

    const paymentsReceivedMonth = payments.reduce((sum, payment) => {
      if (normalizePaymentStatus(payment.status) !== 'succeeded') return sum;
      const paidMs = toMillis(payment.paidAt || payment.updatedAt || payment.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      return sum + Number(payment.amountUsd || 0);
    }, 0);

    const outstandingInvoices = invoices.reduce((sum, inv) => {
      const status = normalizeInvoiceStatus(inv.status);
      if (['paid', 'void'].includes(status)) return sum;
      return sum + Number(inv.amountTotalUsd || 0);
    }, 0);

    const nowMs = now.getTime();
    const agingBuckets = invoices.reduce(
      (acc, inv) => {
        const status = normalizeInvoiceStatus(inv.status);
        if (['paid', 'void'].includes(status)) return acc;
        const dueMs = toMillis(inv.dueDate);
        if (!dueMs) {
          acc.bucket0to30 += Number(inv.amountTotalUsd || 0);
          return acc;
        }
        const diffDays = Math.max(0, Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)));
        const value = Number(inv.amountTotalUsd || 0);
        if (diffDays <= 30) acc.bucket0to30 += value;
        else if (diffDays <= 60) acc.bucket31to60 += value;
        else if (diffDays <= 90) acc.bucket61to90 += value;
        else acc.bucket90plus += value;
        return acc;
      },
      { bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucket90plus: 0 },
    );

    const payrollDueMonth = payroll.reduce((sum, row) => {
      if (String(row.status || '') === 'Paid') return sum;
      if (String(row.month || '') !== getMonthKey(now)) return sum;
      return sum + Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
    }, 0);

    const expensesMonth = expenses.reduce((sum, row) => {
      const expenseMs = toMillis(row.expenseDate || row.createdAt);
      if (!expenseMs || expenseMs < startMs) return sum;
      return sum + Number(row.amountPkr || 0);
    }, 0);

    const seriesMonths = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      return getMonthKey(d);
    });

    const allPaymentsForDedup = await adminDb
      .collection('payments')
      .where('tenantId', '==', auth.user.tenantId)
      .where('isDeleted', '==', false)
      .limit(1000)
      .get();

    const paidInvoiceIds = new Set(
      allPaymentsForDedup.docs
        .map((d) => d.data())
        .filter((p) => String(p.status || '').toLowerCase() === 'succeeded')
        .map((p) => String(p.invoiceId || ''))
        .filter(Boolean),
    );

    const revenueSeries = seriesMonths.map((key) => ({ label: key, invoices: 0, payments: 0 }));

    invoices.forEach((inv) => {
      if (normalizeInvoiceStatus(inv.status) !== 'paid') return;
      if (paidInvoiceIds.has(String(inv.id || ''))) return;
      const paidMs = toMillis(inv.paidAt || inv.updatedAt || inv.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      const bucket = revenueSeries.find((row) => row.label === key);
      if (!bucket) return;
      bucket.invoices += Number(inv.amountTotalUsd || 0);
    });

    const scopedPayments = payments.filter((pay) => {
      if (normalizePaymentStatus(pay.status) !== 'succeeded') return false;
      const paidMs = toMillis(pay.paidAt || pay.createdAt);
      return !!paidMs;
    });

    scopedPayments.forEach((pay) => {
      const paidMs = toMillis(pay.paidAt || pay.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      const bucket = revenueSeries.find((row) => row.label === key);
      if (!bucket) return;
      bucket.payments += Number(pay.amountUsd || 0);
    });

    const expenseGroups = new Map<string, number>();
    expenses.forEach((row) => {
      const expenseMs = toMillis(row.expenseDate || row.createdAt);
      if (!expenseMs || expenseMs < startMs) return;
      const category = String(row.category || 'Other');
      expenseGroups.set(category, (expenseGroups.get(category) || 0) + Number(row.amountPkr || 0));
    });

    const expenseBreakdown = Array.from(expenseGroups.entries()).map(([label, value]) => ({
      label,
      value,
    }));

    const recentEvents = eventsSnap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        type: String(data.type || ''),
        title: String(data.title || ''),
        description: String(data.description || ''),
        entityType: data.entityType || '',
        entityId: data.entityId || '',
        createdAt: toISO(data.createdAt),
        createdByUid: data.createdByUid || '',
        createdByName: data.createdByName || '',
      };
    });

    const responsePayload = {
      ok: true,
      overview: {
        kpisUsd: {
          totalRevenueMonth,
          outstandingInvoices,
          paymentsReceivedMonth,
          agingBuckets,
        },
        kpisPkr: {
          payrollDueMonth,
          expensesMonth,
        },
        revenueSeries,
        expenseBreakdown,
        recentEvents,
      },
    };
    if (redis) {
      await (redis as any)
        .setex(cacheKey, 60, JSON.stringify(responsePayload))
        .catch(() => undefined);
    }
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error('finance/overview error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load finance overview.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
