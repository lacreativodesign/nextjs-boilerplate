import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { UserService } from '@/lib/users/user-service';
import { getCurrentUser, isAdminRole } from '@/app/api/admin/_utils';
import { planLimitResponseBody } from '@/lib/billing/user-limit';
import { SeatLimitExceededError } from '@/lib/billing/seat-reservation';
import { assertPermission, Permission } from '@/app/lib/permissions';
import { isRoleEnabled, resolveTenantRoles } from '@/lib/tenant/access';

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

export async function POST(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterRole = String(me.role || '').toLowerCase();
    if (!isAdminRole(requesterRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      assertPermission(requesterRole, Permission.ManageUsers);
      assertPermission(requesterRole, Permission.ManageRoles);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = inviteSchema.parse(body);
    const tenantId = String(me.tenantId || '').trim();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 403 });
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const rolesEnabled = resolveTenantRoles(tenantSnap.data()?.rolesEnabled);
    if (!isRoleEnabled(rolesEnabled, data.role)) {
      return NextResponse.json(
        { error: 'This role is not enabled for your workspace.' },
        { status: 400 },
      );
    }

    // Plan seat limit (Starter 10 / Pro 20 / Enterprise unlimited). Counts active staff
    // seats plus pending staff invitations; client portal identities are not billable
    // staff seats. The check lives inside UserService.inviteUser, where it holds an
    // atomic seat reservation across the invitation write — a pre-check here would be a
    // second, weaker gate that two concurrent requests could both pass.
    const invitationId = await UserService.inviteUser({
      tenantId,
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
    if (error instanceof SeatLimitExceededError) {
      return NextResponse.json(planLimitResponseBody(error.check), { status: 403 });
    }
    console.error('Error inviting user:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send invitation' },
      { status: 500 },
    );
  }
}
