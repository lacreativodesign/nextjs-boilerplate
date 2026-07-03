import type { NextRequest } from 'next/server';
import { getCurrentUserOrThrow, isSuperAdmin, type CurrentUser } from '@/lib/tenant/server';

export async function requireSuperAdmin(req: NextRequest): Promise<CurrentUser> {
  const user = await getCurrentUserOrThrow(req);
  if (!isSuperAdmin(user)) {
    throw new Error('Forbidden');
  }
  return user;
}
