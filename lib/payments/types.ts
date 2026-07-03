export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export type PaymentMethod = 'stripe_checkout' | 'card' | 'bank_transfer' | 'manual';

export type PaymentRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  invoiceId: string;
  orderId: string;
  amountUsd: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  stripePaymentIntentId: string;
  stripeCheckoutSessionId?: string | null;
  stripeChargeId?: string | null;
  stripeCustomerId?: string | null;
  receiptUrl?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  refundedAmountUsd?: number;
  paidAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  createdByUid?: string | null;
  isDeleted: boolean;
};

export type PaymentIntentRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  invoiceId: string;
  paymentId: string;
  stripePaymentIntentId: string;
  stripeCheckoutSessionId: string;
  amountUsd: number;
  currency: string;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'succeeded'
    | 'canceled';
  createdAt: unknown;
  updatedAt: unknown;
};

export type PaymentRefundRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  invoiceId: string;
  paymentId: string;
  stripeRefundId: string;
  stripePaymentIntentId: string;
  amountUsd: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'other';
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
};
