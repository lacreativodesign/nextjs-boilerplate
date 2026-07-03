import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAutomationAdmin } from '../../../_utils';

export const runtime = 'nodejs';

export async function PUT(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const workflowRef = adminDb.collection('automation_workflows').doc(params.id);
  const snap = await workflowRef.get();
  if (!snap.exists || snap.data()?.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: 'Workflow not found.' }, { status: 404 });
  }

  const current = snap.data()?.status === 'active' ? 'active' : 'disabled';
  const next = current === 'active' ? 'disabled' : 'active';

  await workflowRef.set(
    { status: next, updatedBy: auth.user.uid, updatedAt: new Date().toISOString() },
    { merge: true },
  );
  return NextResponse.json({ ok: true, status: next });
}
