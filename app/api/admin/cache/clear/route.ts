import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSuperAdmin, requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { invalidateByPrefix, invalidateTag } from '@/lib/cache/redis-client';
import { resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

const clearCacheSchema = z.object({
  tenantId: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = clearCacheSchema.parse(await req.json());
    const callerIsSuperAdmin = isSuperAdmin(auth.user.role);
    const callerTenantId = String(auth.user.tenantId || '').trim();

    // Cross-tenant hardening: a raw prefix wipe or an arbitrary tag can reach across
    // tenant namespaces (e.g. prefix "tenant:" flushes EVERY tenant). Those are
    // super-admin-only. A tenant admin may only clear their own tenant's caches, and
    // any tenantId they pass is ignored in favour of their authenticated tenant.
    if (!callerIsSuperAdmin && (payload.prefix || payload.tag)) {
      return NextResponse.json(
        { ok: false, error: 'Only a super admin may clear caches by prefix or tag.' },
        { status: 403 },
      );
    }

    if (payload.tag) {
      // Reached only by super admin (guarded above).
      await invalidateTag(payload.tag);
      return NextResponse.json({ ok: true, cleared: { tag: payload.tag } });
    }

    if (payload.prefix) {
      // Reached only by super admin (guarded above).
      await invalidateByPrefix(payload.prefix);
      return NextResponse.json({ ok: true, cleared: { prefix: payload.prefix } });
    }

    // Tenant-scoped clear. Super admin may target any tenant via the body; a tenant admin
    // is pinned to their own tenant regardless of what the body claims.
    const targetTenantId = callerIsSuperAdmin
      ? String(payload.tenantId || callerTenantId).trim()
      : callerTenantId;

    if (!targetTenantId) {
      return NextResponse.json(
        { ok: false, error: 'No tenant context available for cache clear.' },
        { status: 400 },
      );
    }

    await invalidateTag(`tenant:${targetTenantId}:tax-rates`);
    await invalidateTag(`tenant:${targetTenantId}:search`);
    await invalidateTag(`tenant:${targetTenantId}:permissions`);
    return NextResponse.json({
      ok: true,
      cleared: {
        tenantId: targetTenantId,
        tags: [
          `tenant:${targetTenantId}:tax-rates`,
          `tenant:${targetTenantId}:search`,
          `tenant:${targetTenantId}:permissions`,
        ],
      },
    });
  } catch (err) {
    logError(err, { route: 'POST /api/admin/cache/clear' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to clear cache.',
    });
    return NextResponse.json(body, { status });
  }
}
