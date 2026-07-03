import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
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

    if (payload.tag) {
      await invalidateTag(payload.tag);
      return NextResponse.json({ ok: true, cleared: { tag: payload.tag } });
    }

    if (payload.prefix) {
      await invalidateByPrefix(payload.prefix);
      return NextResponse.json({ ok: true, cleared: { prefix: payload.prefix } });
    }

    if (payload.tenantId) {
      await invalidateTag(`tenant:${payload.tenantId}:tax-rates`);
      await invalidateTag(`tenant:${payload.tenantId}:search`);
      await invalidateTag(`tenant:${payload.tenantId}:permissions`);
      return NextResponse.json({
        ok: true,
        cleared: {
          tenantId: payload.tenantId,
          tags: [
            `tenant:${payload.tenantId}:tax-rates`,
            `tenant:${payload.tenantId}:search`,
            `tenant:${payload.tenantId}:permissions`,
          ],
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Provide one of: tag, prefix, or tenantId.' },
      { status: 400 },
    );
  } catch (err) {
    logError(err, { route: 'POST /api/admin/cache/clear' });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: 'Failed to clear cache.',
    });
    return NextResponse.json(body, { status });
  }
}
