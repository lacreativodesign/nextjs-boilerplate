import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getTenantIdForRequestOrThrow } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Milestone = { id: string; title: string; completed: boolean; href: string };

async function exists(
  collection: string,
  tenantId: string,
  extra?: { field: string; value: unknown },
): Promise<boolean> {
  try {
    let q = adminDb.collection(collection).where('tenantId', '==', tenantId);
    if (extra) q = q.where(extra.field, '==', extra.value);
    const snap = await q.limit(1).get();
    return !snap.empty;
  } catch {
    // Degrade safely (e.g. missing composite index) — never break the dashboard.
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantIdForRequestOrThrow(req);

    const [hasLead, hasDeal, hasInvoice, hasPaid, hasProject, hasClient] = await Promise.all([
      exists('leads', tenantId),
      exists('deals', tenantId),
      exists('invoices', tenantId),
      exists('invoices', tenantId, { field: 'status', value: 'paid' }),
      exists('projects', tenantId),
      exists('clients', tenantId),
    ]);

    const milestones: Milestone[] = [
      { id: 'workspace', title: 'Workspace created', completed: true, href: '/settings' },
      { id: 'lead', title: 'Add your first lead', completed: hasLead, href: '/sales' },
      { id: 'deal', title: 'Create your first deal', completed: hasDeal, href: '/sales' },
      { id: 'invoice', title: 'Send your first invoice', completed: hasInvoice, href: '/finance' },
      { id: 'payment', title: 'Get your first payment', completed: hasPaid, href: '/finance' },
      {
        id: 'project',
        title: 'Start your first project',
        completed: hasProject,
        href: '/production',
      },
      { id: 'client', title: 'Add your first client', completed: hasClient, href: '/clients' },
    ];

    const completed = milestones.filter((m) => m.completed).length;
    const progress = Math.round((completed / milestones.length) * 100);

    return NextResponse.json({ milestones, progress });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to compute activation progress.' },
      { status: 401 },
    );
  }
}
