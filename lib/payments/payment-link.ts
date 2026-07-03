function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured.');
  }
  return appUrl.replace(/\/$/, '');
}

export function generatePaymentLink(invoiceId: string): string {
  return `${getAppUrl()}/pay/${invoiceId}`;
}

export function generatePaymentLinkWithToken(invoiceId: string, token?: string): string {
  const base = generatePaymentLink(invoiceId);
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
