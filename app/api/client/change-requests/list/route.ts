import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireClient, toISO } from '../../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHANGE_REQUEST_TYPES = [
  'Scope Change',
  'Revision',
  'New Feature',
  'Bug Fix',
  'Other',
] as const;
const CHANGE_REQUEST_STATUSES = [
  'Submitted',
  'In Review',
  'Approved',
  'In Progress',
  'Completed',
  'Rejected',
] as const;
const CHANGE_REQUEST_PRIORITIES = ['Low', 'Medium', 'High'] as const;

type ChangeRequestDoc = {
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  type?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  estimatedCost?: number | null;
  estimatedTimelineDays?: number | null;
  approvedAt?: any;
  approvedByUid?: string | null;
  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;
  isDeleted?: boolean;
  tenantId?: string;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const status = String(searchParams.get('status') || '').trim();
    const type = String(searchParams.get('type') || '').trim();
    const priority = String(searchParams.get('priority') || '').trim();
    const q = String(searchParams.get('q') || '')
      .trim()
      .toLowerCase();

    const snap = await adminDb
      .collection('changeRequests')
      .where('clientId', '==', auth.clientId)
      .where('isDeleted', '==', false)
      .limit(500)
      .get();

    let changeRequests = snap.docs
      .map((doc) => {
        const data = doc.data() as ChangeRequestDoc;
        return {
          id: doc.id,
          tenantId: data.tenantId || '',
          projectId: data.projectId || '',
          projectName: data.projectName || '',
          clientId: data.clientId || '',
          clientName: data.clientName || '',
          type: data.type || 'Other',
          title: data.title || '',
          description: data.description || '',
          status: data.status || 'Submitted',
          priority: data.priority || 'Medium',
          estimatedCost: data.estimatedCost ?? null,
          estimatedTimelineDays: data.estimatedTimelineDays ?? null,
          approvedAt: toISO(data.approvedAt),
          approvedByUid: data.approvedByUid || null,
          createdAt: toISO(data.createdAt),
          updatedAt: toISO(data.updatedAt),
          completedAt: toISO(data.completedAt),
        };
      })
      .filter((item) => String((item as Record<string, any>).tenantId || '') === tenantId);

    if (
      status &&
      CHANGE_REQUEST_STATUSES.includes(status as (typeof CHANGE_REQUEST_STATUSES)[number])
    ) {
      changeRequests = changeRequests.filter((item) => item.status === status);
    }

    if (type && CHANGE_REQUEST_TYPES.includes(type as (typeof CHANGE_REQUEST_TYPES)[number])) {
      changeRequests = changeRequests.filter((item) => item.type === type);
    }

    if (
      priority &&
      CHANGE_REQUEST_PRIORITIES.includes(priority as (typeof CHANGE_REQUEST_PRIORITIES)[number])
    ) {
      changeRequests = changeRequests.filter((item) => item.priority === priority);
    }

    if (q) {
      changeRequests = changeRequests.filter((item) => {
        const hay = [item.projectName, item.title, item.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({ ok: true, changeRequests });
  } catch (err: any) {
    console.error('client/change-requests list error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load change requests.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
