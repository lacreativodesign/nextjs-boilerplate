import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { productStorageBucket } from '@/lib/storage/product-bucket';
import {
  PUBLIC_LOGO_CONTENT_TYPES,
  isPublicLogoPath,
  isSafeTenantId,
  logoPathFromLegacyUrl,
} from '@/lib/white-label/public-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Matches the upload ceiling in uploadTenantLogo(); anything larger is not a logo we wrote. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const NOT_FOUND = () =>
  new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });

/**
 * P0-07 — the tenant logo, served publicly WITHOUT a Firebase download token.
 *
 * Deliberately unauthenticated: the logo appears on the public invoice payment page and in
 * invoice PDFs. See lib/white-label/public-logo.ts for the full rationale. What keeps this
 * narrow:
 *
 *   - the object read is decided by the TENANT DOCUMENT, never by the request: the path is
 *     the tenant's recorded `logoStoragePath` (or, for a pre-P0-07 tenant, the path inside
 *     its legacy logo URL), and it must be one of that tenant's logo objects
 *     (tenants/{t}/branding/logo.* or the legacy tenants/{t}/brand/logo.webp);
 *   - the content type must be an allow-listed image type, and the size a logo's size;
 *   - SVG — the one type that can carry script — is served with a CSP that forbids script
 *     and a sandbox, plus nosniff, so opening the URL directly cannot execute anything on
 *     Bizosto's origin;
 *   - no token, signed URL or storage path is ever returned.
 */
export async function GET(_req: Request, props: { params: Promise<{ tenantId: string }> }) {
  const tenantId = String((await props.params).tenantId || '').trim();
  if (!isSafeTenantId(tenantId)) return NOT_FOUND();

  try {
    const snap = await adminDb.collection('tenants').doc(tenantId).get();
    if (!snap.exists) return NOT_FOUND();
    const tenant = snap.data() || {};

    const recorded = String(tenant.whiteLabel?.logoStoragePath || '').trim();
    const storagePath =
      recorded ||
      logoPathFromLegacyUrl(tenant.whiteLabel?.logoUrl, tenantId) ||
      logoPathFromLegacyUrl(tenant.brand?.logoUrl, tenantId);
    if (!storagePath || !isPublicLogoPath(storagePath, tenantId)) return NOT_FOUND();

    const ext = storagePath.split('.').pop() || '';
    const contentType = PUBLIC_LOGO_CONTENT_TYPES[ext];
    if (!contentType) return NOT_FOUND();

    const file = productStorageBucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata?.size ?? Infinity) > MAX_LOGO_BYTES) return NOT_FOUND();

    const [bytes] = await file.download();
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Content-Disposition': `inline; filename="logo.${ext}"`,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch (error) {
    if ((error as { code?: number } | null)?.code === 404) return NOT_FOUND();
    console.error('public branding logo error', { name: (error as Error | null)?.name });
    return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
