import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { getExchangeRates } from '@/lib/finance/exchangeRates';
import { NotificationPreferenceService } from '@/lib/notifications/preferences';
import { authorizeCronRequest } from '@/lib/cron/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, error: authorization.code },
        { status: authorization.status },
      );
    }

    const [dailyDigestSent, exchangeRateRefreshed, expiredSessionsRevoked, archivedProjects] =
      await Promise.all([
        NotificationPreferenceService.processDigestBatch('daily'),
        refreshExchangeRateCache(),
        cleanupExpiredSessions(),
        archiveCompletedProjectsOlderThan90Days(),
      ]);

    return NextResponse.json({
      ok: true,
      summary: {
        dailyDigestSent,
        exchangeRateRefreshed,
        expiredSessionsRevoked,
        archivedProjects,
      },
    });
  } catch (error: any) {
    console.error('cron/daily-tasks error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Daily tasks failed.' },
      { status: 500 },
    );
  }
}

async function refreshExchangeRateCache() {
  const rates = await getExchangeRates('USD');
  return {
    baseCurrency: 'USD',
    currencyCount: Object.keys(rates).length,
  };
}

async function cleanupExpiredSessions() {
  const now = new Date();
  const snapshot = await adminDb
    .collection('sessions')
    .where('active', '==', true)
    .where('expiresAt', '<=', now)
    .limit(500)
    .get();

  if (snapshot.empty) return 0;

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => {
    batch.set(
      doc.ref,
      {
        active: false,
        revokedAt: now,
        revokedReason: 'daily-cron-expired',
      },
      { merge: true },
    );
  });

  await batch.commit();
  return snapshot.size;
}

async function archiveCompletedProjectsOlderThan90Days() {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);

  const snapshot = await adminDb
    .collectionGroup('projects')
    .where('status', 'in', ['completed', 'delivered'])
    .limit(500)
    .get();
  if (snapshot.empty) return 0;

  const batch = adminDb.batch();
  let archived = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const archivedAt = data.archivedAt;
    if (archivedAt) return;

    const completedAtRaw = data.completedAt || data.deliveredAt || data.updatedAt || data.endDate;
    const completedAt = toDate(completedAtRaw);
    if (!completedAt || completedAt > cutoff) return;

    batch.set(
      doc.ref,
      {
        status: 'archived',
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBy: 'system:cron:daily-tasks',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    archived += 1;
  });

  if (!archived) return 0;
  await batch.commit();
  return archived;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
