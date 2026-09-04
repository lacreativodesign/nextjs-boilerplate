import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  generateWeeklyComplianceReports,
  runRetentionCleanupAcrossTenants,
} from '@/lib/compliance/data-retention';
import { getExchangeRates } from '@/lib/finance/exchangeRates';
import { NotificationPreferenceService } from '@/lib/notifications/preferences';
import { enqueueJob } from '@/lib/jobs/job-queue';
import { reconcilePendingPaymentActivations } from '@/lib/finance/operationalActivationReconciler';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET || CRON_SECRET === 'change-me-in-production') {
      return NextResponse.json(
        { ok: false, error: 'Cron secret is not configured securely.' },
        { status: 500 },
      );
    }

    if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [
      cleanupSummary,
      complianceReports,
      dailyDigestSent,
      exchangeRateRefreshed,
      expiredSessionsRevoked,
      archivedProjects,
      paymentActivations,
    ] = await Promise.all([
      runRetentionCleanupAcrossTenants(),
      generateWeeklyComplianceReports(),
      NotificationPreferenceService.processDigestBatch('daily'),
      refreshExchangeRateCache(),
      cleanupExpiredSessions(),
      archiveCompletedProjectsOlderThan90Days(),
      reconcilePendingPaymentActivations(),
    ]);

    const [scheduledReports, syncJobs] = await Promise.all([
      enqueueDailyReportJobs(),
      enqueueDailyIntegrationSyncJobs(),
    ]);

    return NextResponse.json({
      ok: true,
      summary: {
        cleanupSummary,
        complianceReports,
        dailyDigestSent,
        exchangeRateRefreshed,
        expiredSessionsRevoked,
        archivedProjects,
        paymentActivations,
        scheduledReports,
        syncJobs,
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

async function enqueueDailyReportJobs() {
  const tenantDocs = await adminDb.collection('tenants').limit(500).get();
  const jobs = await Promise.all(
    tenantDocs.docs.map(async (doc) => {
      const jobId = await enqueueJob({
        type: 'report_generation',
        payload: {
          tenantId: doc.id,
          reportName: 'daily-operational-summary',
          triggeredBy: 'system:cron:daily-tasks',
        },
      });
      return { tenantId: doc.id, jobId };
    }),
  );

  return {
    count: jobs.length,
    jobs,
  };
}

async function enqueueDailyIntegrationSyncJobs() {
  const integrations = await adminDb
    .collectionGroup('integrations')
    .where('connected', '==', true)
    .where('settings.scheduleDaily', '==', true)
    .get();

  const jobs: Array<{ tenantId: string; provider: 'quickbooks' | 'xero'; jobId: string }> = [];

  for (const doc of integrations.docs) {
    if (doc.id !== 'quickbooks' && doc.id !== 'xero') continue;

    const tenantRef = doc.ref.parent.parent;
    if (!tenantRef) continue;

    const provider = doc.id as 'quickbooks' | 'xero';
    const jobId = await enqueueJob({
      type: 'data_sync',
      payload: {
        tenantId: tenantRef.id,
        provider,
        triggeredBy: 'system:cron:daily-tasks',
      },
    });

    jobs.push({
      tenantId: tenantRef.id,
      provider,
      jobId,
    });
  }

  return {
    count: jobs.length,
    jobs,
  };
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
