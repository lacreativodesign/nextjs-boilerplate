import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import { buildMicrosoftAuthUrl, storeMicrosoftOAuthState } from '@/lib/integrations/microsoft-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const returnTo =
      new URL(request.url).searchParams.get('returnTo') || '/admin/settings/integrations';
    const { state, url, expiresAt } = buildMicrosoftAuthUrl({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      returnTo,
    });

    await storeMicrosoftOAuthState({
      state,
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      returnTo,
      expiresAt,
    });

    return NextResponse.redirect(url);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to start Microsoft OAuth.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
