import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { saveSsoConnection, SsoProvider } from '@/lib/auth/sso-oauth';

export const runtime = 'nodejs';

function asProvider(value: string): SsoProvider {
  if (value === 'google' || value === 'microsoft' || value === 'okta' || value === 'auth0') {
    return value;
  }
  throw new Error('Unsupported SSO provider.');
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdminOrSuperAdmin();
    if (!authResult.ok) {
      return NextResponse.json(
        { ok: false, error: authResult.error },
        { status: authResult.status },
      );
    }

    const body = await req.json();
    const provider = asProvider(String(body.provider || ''));
    const tenantId = authResult.user.tenantId || '';

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'tenantId is required.' }, { status: 400 });
    }

    const connection = await saveSsoConnection(
      tenantId,
      provider,
      {
        enabled: Boolean(body.enabled),
        clientId: String(body.clientId || ''),
        clientSecret: String(body.clientSecret || ''),
        tenantHint: body.tenantHint ? String(body.tenantHint) : null,
        allowedDomains: Array.isArray(body.allowedDomains)
          ? body.allowedDomains.map((d: unknown) => String(d))
          : [],
        autoProvision: body.autoProvision !== false,
      },
      authResult.user.uid,
    );

    return NextResponse.json({
      ok: true,
      connection: { ...connection, clientSecret: connection.clientSecret ? '***' : '' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to configure SSO provider.' },
      { status: 400 },
    );
  }
}
