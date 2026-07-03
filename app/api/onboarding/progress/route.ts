import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getTenantIdForRequestOrThrow } from '@/lib/tenant/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantIdForRequestOrThrow(req);

    const doc = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('onboarding_progress')
      .doc('checklist')
      .get();

    return NextResponse.json(doc.data() || null);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to fetch onboarding progress.' },
      { status: 401 },
    );
  }
}

type OnboardingStep = {
  id: string;
  title: string;
  completed: boolean;
};

export async function PUT(req: NextRequest) {
  try {
    const tenantId = await getTenantIdForRequestOrThrow(req);
    const body = (await req.json().catch(() => null)) as { stepId?: string } | null;
    const stepId = String(body?.stepId || '').trim();

    if (!stepId) {
      return NextResponse.json({ error: 'Missing stepId' }, { status: 400 });
    }

    const ref = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('onboarding_progress')
      .doc('checklist');

    const updated = await adminDb.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const doc = await tx.get(ref);
      const data = doc.data() as { steps?: OnboardingStep[] } | undefined;

      if (!data || !Array.isArray(data.steps) || data.steps.length === 0) {
        throw new Error('CHECKLIST_NOT_FOUND');
      }

      const steps = data.steps.map((s) => (s.id === stepId ? { ...s, completed: true } : s));
      const completed = steps.filter((s) => s.completed).length;
      const progress = Math.round((completed / steps.length) * 100);

      tx.update(ref, {
        steps,
        progress,
        updatedAt: new Date().toISOString(),
      });

      return { steps, progress };
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'CHECKLIST_NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update onboarding progress.' },
      { status: 401 },
    );
  }
}
