import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../_utils';

export const runtime = 'nodejs';

const VALID_ROLE_KEYS = new Set([
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
]);

export async function PATCH(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;
    const body = await req.json().catch(() => ({}));
    const rolesEnabled = body?.rolesEnabled;

    if (!rolesEnabled || typeof rolesEnabled !== 'object' || Array.isArray(rolesEnabled)) {
      return NextResponse.json(
        { ok: false, error: 'rolesEnabled must be an object' },
        { status: 400 },
      );
    }

    for (const [key, value] of Object.entries(rolesEnabled as Record<string, unknown>)) {
      if (!VALID_ROLE_KEYS.has(key)) {
        return NextResponse.json({ ok: false, error: `Invalid role key: ${key}` }, { status: 400 });
      }
      if (typeof value !== 'boolean') {
        return NextResponse.json(
          { ok: false, error: `Invalid role value for ${key}` },
          { status: 400 },
        );
      }
    }

    const now = new Date().toISOString();
    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();

    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
    }

    await tenantRef.set(
      {
        rolesEnabled,
        updatedAt: now,
      },
      { merge: true },
    );

    await adminDb.collection('audit_logs').add({
      tenantId,
      action: 'roles_updated',
      performedBy: user.uid,
      changes: rolesEnabled,
      timestamp: now,
    });

    return NextResponse.json({ ok: true, rolesEnabled });
  } catch (error: any) {
    const message = error?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
