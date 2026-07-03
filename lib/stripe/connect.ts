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

export function calculatePlatformFee(amountCents: number): number {
  return Math.max(1, Math.round(amountCents * 0.005));
}

export async function createConnectCharge(params: {
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  connectedAccountId: string;
  description: string;
  metadata: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  try {
    const stripe = getStripeClient();
    const platformFee = calculatePlatformFee(params.amount);

    return await stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      confirmation_method: 'automatic',
      confirm: true,
      description: params.description,
      metadata: params.metadata,
      application_fee_amount: platformFee,
      transfer_data: {
        destination: params.connectedAccountId,
      },
    });
  } catch (error) {
    console.error('[STRIPE_CONNECT] Failed to create connect charge', {
      connectedAccountId: params.connectedAccountId,
      amount: params.amount,
      error,
    });
    throw error;
  }
}
