import fs from 'fs';
import path from 'path';
import { ROUTE_CONTRACTS, classifyRouteSource, type RouteContract } from '@/lib/api/route-contract';

/**
 * Route-contract vocabulary guard.
 *
 * ROUTE_CONTRACTS is the single source of truth for the route classification
 * vocabulary (RouteContract is derived from it via typeof[number]). These tests:
 *  1. lock the exact set of contract kinds, and
 *  2. assert the classifier only ever emits a value from that set (or null),
 * so a new classification can't be introduced without updating the vocabulary.
 *
 * It also documents WHY the tuple form exists: it formats identically under any
 * Prettier printWidth, which stops the recurring 80-vs-100 format-gate churn.
 */

describe('route-contract vocabulary', () => {
  it('locks the exact set of route contracts', () => {
    expect([...ROUTE_CONTRACTS]).toEqual([
      'public',
      'authenticated',
      'tenant_scoped',
      'super_admin',
      'webhook',
      'cron',
      'internal',
    ]);
  });

  it('has no duplicate contract kinds', () => {
    expect(new Set(ROUTE_CONTRACTS).size).toBe(ROUTE_CONTRACTS.length);
  });

  it('the tuple form is preserved (printWidth-stable, not a collapsible union)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/api/route-contract.ts'), 'utf8');
    expect(src).toContain('export const ROUTE_CONTRACTS = [');
    expect(src).toContain('export type RouteContract = (typeof ROUTE_CONTRACTS)[number];');
  });

  it('classifyRouteSource only ever emits a known contract or null', () => {
    const valid = new Set<RouteContract>(ROUTE_CONTRACTS);
    const samples: Array<{ rel: string; src: string }> = [
      { rel: 'health', src: 'export async function GET() {}' },
      { rel: 'admin/quotas', src: 'requireSuperAdmin(); export async function POST() {}' },
      {
        rel: 'stripe/webhook',
        src: 'stripe.webhooks.constructEvent(); export async function POST() {}',
      },
      { rel: 'cron/backup', src: 'process.env.CRON_SECRET; export async function GET() {}' },
    ];
    for (const { rel, src } of samples) {
      const result = classifyRouteSource(rel, src);
      expect(result === null || valid.has(result)).toBe(true);
    }
  });
});
