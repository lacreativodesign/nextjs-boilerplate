import { NextResponse } from 'next/server';
import { DEMO_TENANT_ID } from '@/lib/demo/users';

export type DemoAction = 'seed' | 'reset';

const ACTION_LABELS: Record<DemoAction, { past: string; infinitive: string }> = {
  seed: { past: 'seeded', infinitive: 'seed' },
  reset: { past: 'reset', infinitive: 'reset' },
};

/**
 * Rebuilds the deterministic golden fixture for the `bizosto-demo` tenant.
 *
 * Both Super Admin demo endpoints do exactly this — tenant-scoped data is wiped
 * and re-seeded so every certification run starts from identical state — and
 * they differ only in the label they report back to the operator. Authorization
 * deliberately stays in each route file, where the P0-5 route-contract gate can
 * see the guard the route actually calls; only the work and the response
 * envelope are shared.
 *
 * The caller is responsible for authorizing the request before invoking this.
 */
export async function rebuildGoldenTenant(action: DemoAction): Promise<NextResponse> {
  const { seedDemoEnvironment } = await import('@/lib/demo/seed');
  const result = await seedDemoEnvironment({ tenantId: DEMO_TENANT_ID, reset: true });

  return NextResponse.json({
    ok: true,
    message: `Demo environment ${ACTION_LABELS[action].past} successfully`,
    seededAt: new Date().toISOString(),
    counts: result.counts,
  });
}

/**
 * Shared failure envelope. Reports why the rebuild failed without echoing
 * anything the caller supplied, and never surfaces configuration values.
 */
export function demoFailure(action: DemoAction, error: unknown): NextResponse {
  console.error(`super_admin/demo/${action} error`, error);
  const reason = error instanceof Error ? error.message : '';

  return NextResponse.json(
    {
      ok: false,
      error: reason || `Failed to ${ACTION_LABELS[action].infinitive} demo environment`,
    },
    { status: 500 },
  );
}
