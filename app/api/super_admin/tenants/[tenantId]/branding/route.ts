import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import { validateRequest } from '@/lib/validations/validate';
import { updateTenantBrandingSchema } from '@/lib/validations/tenant-admin';

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;
    // SOC2 F-06: `logoUrl` was any string, and it is rendered into an <img src> on
    // the tenant branding page. Constraining it to an absolute http(s) URL keeps
    // `javascript:` and `data:` payloads out of a field shown to every user in the
    // workspace.
    const { name, logoUrl = null } = validateRequest(
      updateTenantBrandingSchema,
      await req.json().catch(() => ({})),
    );

    // The tenant must already exist. `set(..., { merge: true })` CREATES a document
    // when none is present, so without this check any tenantId in the URL minted a
    // phantom tenant carrying nothing but a brand — invisible to onboarding, absent
    // from every plan and billing invariant, and impossible to reach through the app.
    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    if (!(await tenantRef.get()).exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
    }

    await tenantRef.set(
      {
        brand: {
          name,
          logoUrl,
          locked: true,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    );

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: 'tenant_branding_updated',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { name, logoUrl },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
