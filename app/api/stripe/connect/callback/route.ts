import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { writeAuditLog } from '@/lib/tenant/audit';
import { exchangeConnectCode, getConnectAccount } from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectWithQuery(baseUrl: URL, value: string, reason?: string): NextResponse {
  const redirectUrl = new URL('/settings/payments', baseUrl.origin);
  redirectUrl.searchParams.set('connect', value);
  if (reason) {
    redirectUrl.searchParams.set('reason', reason);
  }
  return NextResponse.redirect(redirectUrl, 303);
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const error = requestUrl.searchParams.get('error');
    if (error) {
      return redirectWithQuery(requestUrl, 'error', error);
    }

    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');

    if (!code || !state) {
      return redirectWithQuery(requestUrl, 'error', 'invalid_callback');
    }

    // Validate + consume the single-use OAuth state nonce (CSRF protection).
    const stateRef = adminDb.collection('stripe_connect_oauth_states').doc(state);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      return redirectWithQuery(requestUrl, 'error', 'invalid_state');
    }
    const stateData = stateSnap.data() || {};
    // One-time use: delete immediately regardless of outcome.
    await stateRef.delete().catch(() => undefined);

    const tenantId = String(stateData.tenantId || '');
    const userId = String(stateData.userId || '');
    const expiresAt = stateData.expiresAt ? new Date(stateData.expiresAt).getTime() : 0;
    if (!tenantId || !userId || !expiresAt || expiresAt < Date.now()) {
      return redirectWithQuery(requestUrl, 'error', 'invalid_state');
    }

    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return redirectWithQuery(requestUrl, 'error', 'tenant_not_found');
    }

    const { accountId } = await exchangeConnectCode(code);
    const account = await getConnectAccount(accountId);
    if (!account) {
      return redirectWithQuery(requestUrl, 'error', 'account_fetch_failed');
    }

    const now = new Date().toISOString();
    await tenantRef.set(
      {
        stripeConnectAccountId: accountId,
        stripeConnectStatus: 'active',
        stripeConnectEmail: account.email || null,
        stripeConnectBusinessName:
          account.business_profile?.name || (account as any).display_name || null,
        stripeConnectConnectedAt: now,
        stripeConnectChargesEnabled: Boolean(account.charges_enabled),
        stripeConnectPayoutsEnabled: Boolean(account.payouts_enabled),
        updatedAt: now,
      },
      { merge: true },
    );

    await writeAuditLog({
      tenantId,
      actorUserId: userId,
      actionType: 'stripe_connect_connected',
      entityType: 'stripe_connect',
      entityId: accountId,
      metadata: { accountId, email: account.email || null },
    });

    return redirectWithQuery(requestUrl, 'success');
  } catch (error) {
    console.error('[STRIPE_CONNECT] Callback failed', error);
    const requestUrl = new URL(req.url);
    return redirectWithQuery(requestUrl, 'error', 'callback_failed');
  }
}
