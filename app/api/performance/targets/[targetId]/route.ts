import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';

const managerRoles = new Set([
  'admin',
  'super_admin',
  'sales_manager',
  'am_manager',
  'production_manager',
  'hr',
  'finance',
]);

export async function PATCH(req: NextRequest, { params }: { params: { targetId: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!managerRoles.has(normalizeRole(me.role))) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const targetRef = adminDb.collection('performance_targets').doc(params.targetId);
  const current = await targetRef.get();
  if (!current.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const currentData = current.data() || {};
  if (currentData.tenantId !== me.tenantId)
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    metrics?: Record<string, unknown>;
    period?: string;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.period) updates.period = body.period;
  if (body.metrics && typeof body.metrics === 'object') {
    updates.metrics = { ...(currentData.metrics || {}), ...body.metrics };
  }

  await targetRef.set(updates, { merge: true });
  const updated = await targetRef.get();
  return NextResponse.json({ ok: true, target: { id: updated.id, ...(updated.data() || {}) } });
}

export async function DELETE(_: NextRequest, { params }: { params: { targetId: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (normalizeRole(me.role) !== 'admin' && normalizeRole(me.role) !== 'super_admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const targetRef = adminDb.collection('performance_targets').doc(params.targetId);
  const current = await targetRef.get();
  if (!current.exists) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  if (current.data()?.tenantId !== me.tenantId)
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  await targetRef.delete();
  return NextResponse.json({ ok: true });
}
