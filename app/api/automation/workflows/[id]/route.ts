import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAutomationAdmin } from '../../_utils';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAutomationAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const workflowRef = adminDb.collection('automation_workflows').doc(params.id);
    const snap = await workflowRef.get();
    if (!snap.exists || snap.data()?.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Workflow not found.' }, { status: 404 });
    }

    await workflowRef.set(
      {
        ...body,
        tenantId: auth.user.tenantId,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.user.uid,
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('automation/workflows/[id] PUT error', error);
    return NextResponse.json({ ok: false, error: 'Unable to update workflow.' }, { status: 500 });
  }
}
