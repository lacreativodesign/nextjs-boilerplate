import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UserService } from '@/lib/users/user-service';
import { getCurrentUser, normalizeRole } from '@/app/api/admin/_utils';
import { checkUserLimit, planLimitResponseBody } from '@/lib/billing/user-limit';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    'admin',
    'sales_manager',
    'sales',
    'am_manager',
    'am',
    'production_manager',
    'production',
    'finance',
    'hr',
    'client',
  ]),
  teamIds: z.array(z.string().min(1)).optional(),
});

function canInvite(role: string) {
  const normalized = normalizeRole(role);
  return (
    normalized === 'admin' ||
    normalized === 'super_admin' ||
    normalized === 'manager' ||
    normalized === 'owner'
  );
}

export async function POST(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canInvite(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = inviteSchema.parse(body);

    // Plan seat limit (Starter 10 / Pro 20 / Enterprise unlimited). Counts
    // active staff seats; client portal users are not limited. Enforced at
    // invite time so a tenant cannot exceed its plan by inviting.
    const seatCheck = await checkUserLimit(me.tenantId, data.role);
    if (!seatCheck.ok) {
      return NextResponse.json(planLimitResponseBody(seatCheck), { status: 403 });
    }

    const invitationId = await UserService.inviteUser({
      tenantId: me.tenantId,
      email: data.email,
      role: data.role,
      teamIds: data.teamIds,
      invitedBy: me.uid,
      invitedByEmail: me.email,
    });

    return NextResponse.json({
      invitationId,
      message: 'Invitation sent successfully',
    });
  } catch (error: any) {
    console.error('Error inviting user:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send invitation' },
      { status: 500 },
    );
  }
}
