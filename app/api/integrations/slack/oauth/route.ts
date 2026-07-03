import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import {
  buildSlackInstallUrl,
  consumeSlackOAuthState,
  createSlackOAuthState,
  exchangeSlackCodeForAccess,
  saveSlackInstallation,
} from '@/lib/integrations/slack';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));

    if (body?.start) {
      const state = await createSlackOAuthState({
        tenantId: auth.user.tenantId,
        userUid: auth.user.uid,
        returnTo:
          typeof body.returnTo === 'string' ? body.returnTo : '/admin/settings/integrations',
      });
      return NextResponse.json({ ok: true, installUrl: buildSlackInstallUrl(state) });
    }

    const code = typeof body?.code === 'string' ? body.code : '';
    const state = typeof body?.state === 'string' ? body.state : '';
    if (!code || !state) {
      return NextResponse.json(
        { ok: false, error: 'code and state are required.' },
        { status: 400 },
      );
    }

    const statePayload = await consumeSlackOAuthState(state);
    if (statePayload.tenantId !== auth.user.tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Tenant mismatch for OAuth state.' },
        { status: 403 },
      );
    }

    const token = await exchangeSlackCodeForAccess(code);
    await saveSlackInstallation({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      accessToken: String(token.access_token),
      scopes: String(token.scope || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      teamId: token.team?.id || null,
      teamName: token.team?.name || null,
      botUserId: token.bot_user_id || null,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Slack OAuth failed.' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error') || '';

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/settings/integrations?slack_error=${encodeURIComponent(error)}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/admin/settings/integrations?slack_error=missing_code_or_state', request.url),
    );
  }

  try {
    const payload = await consumeSlackOAuthState(state);
    const token = await exchangeSlackCodeForAccess(code);

    await saveSlackInstallation({
      tenantId: payload.tenantId,
      userUid: payload.userUid,
      accessToken: String(token.access_token),
      scopes: String(token.scope || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      teamId: token.team?.id || null,
      teamName: token.team?.name || null,
      botUserId: token.bot_user_id || null,
    });

    return NextResponse.redirect(new URL(`${payload.returnTo}?slack_connected=1`, request.url));
  } catch (oauthError: any) {
    return NextResponse.redirect(
      new URL(
        `/admin/settings/integrations?slack_error=${encodeURIComponent(oauthError?.message || 'oauth_failed')}`,
        request.url,
      ),
    );
  }
}
