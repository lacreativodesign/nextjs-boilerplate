import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHrEvent, requireHrAccess, serverTimestamp } from '../../../_utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing template id' }, { status: 400 });
    }

    const snap = await adminDb.collection('onboardingTemplates').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 });
    }

    const existing = snap.data() || {};
    const isSuperAdmin = (access.user.role || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin && String(existing.tenantId || '') !== String(access.user.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const name = String(body?.name || existing?.name || '').trim();
    const role = String(body?.role || existing?.role || 'all').trim();
    const steps = Array.isArray(body?.steps) ? body.steps : existing?.steps || [];
    const isActive =
      body?.isActive !== undefined ? Boolean(body?.isActive) : existing?.isActive !== false;

    if (!name || steps.length === 0) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    const payload = {
      name,
      role,
      steps: steps.map((step: any) => ({
        title: String(step?.title || '').trim(),
        description: String(step?.description || '').trim(),
        required: Boolean(step?.required),
      })),
      isActive,
      updatedAt: serverTimestamp(),
    };

    await adminDb.collection('onboardingTemplates').doc(id).update(payload);

    await createHrEvent({
      type: 'hr.onboarding_template_updated',
      title: 'Onboarding template updated',
      description: `${name} template updated.`,
      entityType: 'onboardingTemplate',
      entityId: id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || 'Admin',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('HR templates update error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
