import { NextRequest, NextResponse } from 'next/server';
import firebaseAdminApp, { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '@/app/api/super_admin/_utils';
import { DEMO_TENANT_ID, evaluateDemoMutationSafety } from '@/lib/demo/safety';
import { demoRouteErrorResponse } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const tenantId = DEMO_TENANT_ID;
    const mutationSafety = evaluateDemoMutationSafety({
      tenantId,
      projectId: String(firebaseAdminApp?.options.projectId || '').trim(),
    });

    const [clients, leads, invoices, projects, productionJobs, employees] = await Promise.all([
      adminDb.collection('clients').where('tenantId', '==', tenantId).count().get(),
      adminDb.collection('leads').where('tenantId', '==', tenantId).count().get(),
      adminDb.collection('invoices').where('tenantId', '==', tenantId).count().get(),
      adminDb.collection('projects').where('tenantId', '==', tenantId).count().get(),
      adminDb.collection('production_jobs').where('tenantId', '==', tenantId).count().get(),
      adminDb.collection('employees').where('tenantId', '==', tenantId).count().get(),
    ]);

    return NextResponse.json({
      ok: true,
      mutationSafety,
      counts: {
        clients: clients.data().count,
        leads: leads.data().count,
        invoices: invoices.data().count,
        projects: projects.data().count,
        productionJobs: productionJobs.data().count,
        employees: employees.data().count,
      },
    });
  } catch (error: unknown) {
    return demoRouteErrorResponse(error, 'Unable to load demo status');
  }
}
