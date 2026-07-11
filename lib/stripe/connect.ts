import Stripe from 'stripe';
import { getStripeClient } from '@/lib/payments/stripe';

function getConnectClientId(): string {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) {
    throw new Error('STRIPE_CONNECT_CLIENT_ID is not configured.');
  }
  return clientId;
}

function getAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured.');
  }
  return appUrl.replace(/\/$/, '');
}

// `state` must be an unguessable, single-use nonce that the start route persists
// server-side (mapped to tenantId/userId) and the callback validates + consumes.
// Never encode tenantId/userId directly into state — that enables OAuth CSRF.
export function getConnectAuthorizeUrl(state: string): string {
  const authorizeUrl = new URL('https://connect.stripe.com/oauth/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', getConnectClientId());
  authorizeUrl.searchParams.set('scope', 'read_write');
  authorizeUrl.searchParams.set('redirect_uri', `${getAppUrl()}/api/stripe/connect/callback`);
  authorizeUrl.searchParams.set('state', state);
  return authorizeUrl.toString();
}

export async function exchangeConnectCode(
  code: string,
): Promise<{ accountId: string; accessToken: string }> {
  const stripe = getStripeClient();
  const response = await stripe.oauth.token({
    code,
    grant_type: 'authorization_code',
  });

  if (!response.stripe_user_id || !response.access_token) {
    throw new Error('Stripe OAuth response is missing account details.');
  }

  return {
    accountId: response.stripe_user_id,
    accessToken: response.access_token,
  };
}

export async function getConnectAccount(accountId: string): Promise<Stripe.Account | null> {
  try {
    const stripe = getStripeClient();
    return await stripe.accounts.retrieve(accountId);
  } catch (error) {
    console.error('[STRIPE_CONNECT] Failed to retrieve account', { accountId, error });
    return null;
  }
}

export async function disconnectConnectAccount(accountId: string): Promise<void> {
  try {
    const stripe = getStripeClient();
    await stripe.oauth.deauthorize({
      client_id: getConnectClientId(),
      stripe_user_id: accountId,
    });
  } catch (error) {
    console.error('[STRIPE_CONNECT] Failed to deauthorize account', { accountId, error });
  }
}

/**
 * CANONICAL CONNECT CHARGE MODEL — DIRECT CHARGES (decision record, E1).
 *
 * Client-portal invoice payments are Connect DIRECT charges: the PaymentIntent
 * is created ON the tenant's connected account (stripeAccount request option)
 * with application_fee_amount for the platform's 0.5% fee. The tenant is the
 * merchant of record and pays Stripe processing fees; the platform collects
 * only its application fee. Refunds are issued on the connected account with
 * refund_application_fee: true.
 *
 * Do NOT use destination charges (transfer_data.destination) for client
 * payments: they would make the platform the merchant of record and make the
 * platform absorb Stripe processing fees out of a 0.5% application fee — a
 * guaranteed per-transaction loss — and they cannot be combined with the
 * stripeAccount option. The legacy createConnectCharge destination-charge
 * helper was removed for this reason (it had no callers).
 */
export function calculatePlatformFee(amountCents: number): number {
  return Math.max(1, Math.round(amountCents * 0.005));
}
