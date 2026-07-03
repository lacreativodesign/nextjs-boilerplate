import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient, toISO } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REVIEW_STAGES = ['Draft', 'Review', 'Final', 'Revisions'];

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const [projectsSnap, changeSnap, invoiceSnap, notificationsSnap] = await Promise.all([
      adminDb
        .collection('projects')
        .where('clientId', '==', auth.clientId)
        .where('tenantId', '==', auth.tenantId)
        .where('isDeleted', '==', false)
        .get(),
      adminDb
        .collection('changeRequests')
        .where('clientId', '==', auth.clientId)
        .where('tenantId', '==', auth.tenantId)
        .where('isDeleted', '==', false)
        .get(),
      adminDb
        .collection('invoices')
        .where('clientId', '==', auth.clientId)
        .where('tenantId', '==', auth.tenantId)
        .where('isDeleted', '==', false)
        .get(),
      adminDb
        .collection('notifications')
        .where('toUserId', '==', auth.user.uid)
        .orderBy('createdAt', 'desc')
        .limit(8)
        .get()
        .catch(() => null),
    ]);

    const projects = projectsSnap.docs.map((doc) => doc.data() || {});
    const changeRequests = changeSnap.docs.map((doc) => doc.data() || {});
    const invoices = invoiceSnap.docs.map((doc) => doc.data() || {});

    const activeProjects = projects.filter((project) => {
      const stage = String(project.stage || '');
      return stage !== 'Delivered' && stage !== 'Completed';
    }).length;

    const inReview = projects.filter((project) =>
      REVIEW_STAGES.includes(String(project.stage || '')),
    ).length;

    const openChangeRequests = changeRequests.filter((request) => {
      const status = String(request.status || '').toLowerCase();
      return !['completed', 'rejected'].includes(status);
    }).length;

    const outstandingInvoicesUsd = invoices.reduce((sum, invoice) => {
      const status = String(invoice.status || '').toLowerCase();
      if (status === 'paid') return sum;
      return sum + toNumber(invoice.amountTotalUsd || invoice.amountSubtotalUsd || 0);
    }, 0);

    const recentUpdates = (notificationsSnap?.docs || []).map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        title: String(data.title || 'Update'),
        body: String(data.body || data.message || ''),
        type: String(data.type || 'info'),
        deepLink: data.deepLink ? String(data.deepLink) : null,
        createdAt: toISO(data.createdAt),
        isRead: Boolean(data.isRead ?? data.read ?? false),
      };
    });

    return NextResponse.json({
      ok: true,
      kpis: {
        activeProjects,
        inReview,
        openChangeRequests,
        outstandingInvoicesUsd,
      },
      recentUpdates,
    });
  } catch (err: any) {
    console.error('client/overview error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to load overview.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
