import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  SALES_PIPELINE_STAGES,
  canEditSection,
  parseBoolean,
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

    const snap = await adminDb.collection('settings').doc(`${auth.user.tenantId}_sales`).get();
    const data = snap.exists ? snap.data() : {};

    const settings = {
      pipelineStages: [...SALES_PIPELINE_STAGES],
      leadSources: parseStringArray(data?.leadSources),
      campaignTags: parseStringArray(data?.campaignTags),
      discountApprovalThresholdPct: Number.isFinite(Number(data?.discountApprovalThresholdPct))
        ? Number(data?.discountApprovalThresholdPct)
        : 0,
      closedWonAutomations: {
        createClient: parseBoolean(data?.closedWonAutomations?.createClient, false),
        createProject: parseBoolean(data?.closedWonAutomations?.createProject, false),
        generateInvoice: parseBoolean(data?.closedWonAutomations?.generateInvoice, false),
        triggerEmails: parseBoolean(data?.closedWonAutomations?.triggerEmails, false),
      },
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, 'sales'),
      role: auth.user.role,
    });
  } catch (err) {
    console.error('settings/sales get error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, 'sales')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = {
      pipelineStages: [...SALES_PIPELINE_STAGES],
      leadSources: parseStringArray(body?.leadSources),
      campaignTags: parseStringArray(body?.campaignTags),
      discountApprovalThresholdPct: Number.isFinite(Number(body?.discountApprovalThresholdPct))
        ? Number(body?.discountApprovalThresholdPct)
        : 0,
      closedWonAutomations: {
        createClient: parseBoolean(body?.closedWonAutomations?.createClient, false),
        createProject: parseBoolean(body?.closedWonAutomations?.createProject, false),
        generateInvoice: parseBoolean(body?.closedWonAutomations?.generateInvoice, false),
        triggerEmails: parseBoolean(body?.closedWonAutomations?.triggerEmails, false),
      },
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await adminDb
      .collection('settings')
      .doc(`${auth.user.tenantId}_sales`)
      .set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: 'sales',
      summary: 'Sales settings updated.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('settings/sales update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
