import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { buildXeroAuthorizeUrl, createXeroOAuthState } from '@/lib/integrations/xero';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const returnTo =
      request.nextUrl.searchParams.get('returnTo') || '/admin/settings/integrations/xero';
    const state = await createXeroOAuthState({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      returnTo,
    });
    return NextResponse.redirect(buildXeroAuthorizeUrl(state));
  } catch (error: any) {
    console.error('xero/authorize error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to start Xero OAuth.' },
      { status: 500 },
    );
  }
}
