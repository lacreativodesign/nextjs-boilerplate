import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  canAccessPlanModule,
  normalizePlan,
  resolveTenantModules,
  type PlanModuleKey,
} from '@/lib/tenant/plan-access';

export const runtime = 'nodejs';

// Internal-only endpoint: called solely by middleware (server-to-server), which holds
// the signing secret. Prevents unauthenticated tenant enumeration / module probing.
function verifyInternalSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-internal-secret');
  const expected = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  return Boolean(expected && secret && secret === expected);
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyInternalSecret(req)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = req.nextUrl.searchParams.get('tenantId');
    const moduleKey = req.nextUrl.searchParams.get('module');

    if (!tenantId || !moduleKey) {
      return NextResponse.json(
        { ok: false, error: 'tenantId and module are required' },
        { status: 400 },
      );
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      const notFound = NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
      notFound.headers.set('Cache-Control', 'private, max-age=30');
      return notFound;
    }

    const tenantData = tenantSnap.data() || {};

    // S6: resolve through the canonical plan/module resolver rather than reading the
    // legacy `modulesEnabled` map directly. That map is absent on many tenant
    // documents, and the old helper treated an absent key as ENABLED — so middleware
    // waved through every module, including Finance and HR, for any tenant whose map
    // had not been written. Entitlement now derives from the plan, with the tenant's
    // explicit module map applied on top, and fails closed.
    const plan = normalizePlan(tenantData.plan);
    const modules = resolveTenantModules({
      plan,
      modules: tenantData.modules,
      legacyModulesEnabled: tenantData.modulesEnabled,
    });
    const enabled = canAccessPlanModule({
      modules,
      moduleKey: moduleKey as PlanModuleKey,
    });

    const response = NextResponse.json({ ok: true, enabled });
    response.headers.set('Cache-Control', 'private, max-age=30');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Server error' },
      { status: 500 },
    );
  }
}
