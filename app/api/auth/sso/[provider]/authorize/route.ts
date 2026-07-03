import { NextRequest, NextResponse } from 'next/server';
import { createOAuthAuthorizationUrl, SsoProvider } from '@/lib/auth/sso-oauth';
import { getCurrentUser } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';

function asProvider(value: string): SsoProvider {
  if (value === 'google' || value === 'microsoft' || value === 'okta' || value === 'auth0') {
    return value;
  }
  throw new Error('Unsupported SSO provider.');
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const provider = asProvider(params.provider);
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId');
    const mode = url.searchParams.get('mode') === 'link' ? 'link' : 'login';
    const returnTo = url.searchParams.get('returnTo') || '/';

    if (!tenantId) {
      throw new Error('tenantId is required.');
    }

    let linkedUid: string | undefined;
    if (mode === 'link') {
      const current = await getCurrentUser();
      if (!current) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      linkedUid = current.uid;
    }

    const { authorizeUrl } = await createOAuthAuthorizationUrl({
      provider,
      tenantId,
      mode,
      linkedUid,
      returnTo,
    });

    return NextResponse.redirect(authorizeUrl, { status: 302 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to start SSO authorization.' },
      { status: 400 },
    );
  }
}
