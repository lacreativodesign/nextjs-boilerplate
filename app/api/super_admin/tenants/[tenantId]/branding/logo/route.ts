import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import { uploadTenantLogo } from '@/lib/white-label/branding';
import { isSafeTenantId } from '@/lib/white-label/public-logo';

export const runtime = 'nodejs';

const bodySchema = z
  .object({
    dataUrl: z.string().min(10),
    contentType: z.string().min(1).optional(),
  })
  .strict();

/**
 * P0-07 — super_admin uploads a tenant's logo through the server.
 *
 * The Super Admin tenant screen used to upload straight to `tenants/{t}/brand/logo.webp`
 * with the Firebase browser SDK and then persist getDownloadURL() — a tokenized Firebase
 * URL — as the tenant's logo. It now sends the image here, and uploadTenantLogo() stores it
 * in the canonical bucket with no download token and publishes it through the public
 * branding endpoint. Same 2MB ceiling and image-type allow-list as the tenant admin's own
 * logo upload.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = String((await props.params).tenantId || '').trim();
    if (!isSafeTenantId(tenantId)) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ ok: false, error: 'Invalid logo payload' }, { status: 400 });
    }

    // Same phantom-tenant guard as the sibling branding route: set(..., {merge}) would
    // otherwise create a tenant document that exists only to hold a logo.
    if (!(await adminDb.collection('tenants').doc(tenantId).get()).exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
    }

    let uploaded: { logoUrl: string; storagePath: string };
    try {
      uploaded = await uploadTenantLogo(tenantId, body.data);
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: (error as Error)?.message || 'Failed to upload logo' },
        { status: 400 },
      );
    }

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: 'tenant_branding_updated',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { logoStoragePath: uploaded.storagePath },
    });

    return NextResponse.json({ ok: true, logoUrl: uploaded.logoUrl });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: status === 500 ? 'Server error' : message },
      { status },
    );
  }
}
