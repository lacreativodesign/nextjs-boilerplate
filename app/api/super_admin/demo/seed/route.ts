import type { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/app/api/super_admin/_utils';
import { demoFailure, rebuildGoldenTenant } from '../_handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Authorization first: no tenant data is touched until this resolves.
    await requireSuperAdmin(req);
    return await rebuildGoldenTenant('seed');
  } catch (error) {
    return demoFailure('seed', error);
  }
}
