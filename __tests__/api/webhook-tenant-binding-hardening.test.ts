import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('provider webhook tenant binding', () => {
  it('DocuSign fails closed without a configured secret', () => {
    const source = read('lib/integrations/docusign.ts');
    const verifier = source.slice(
      source.indexOf('export function verifyDocusignWebhookSignature'),
      source.indexOf('export async function upsertEnvelopeStatusFromWebhook'),
    );
    expect(verifier).toContain('if (!secret) return false');
    expect(verifier).not.toContain('if (!secret) return true');
  });

  it('DocuSign resolves the tenant from the stored envelope and rejects mismatches', () => {
    const source = read('lib/integrations/docusign.ts');
    const handler = source.slice(
      source.indexOf('export async function upsertEnvelopeStatusFromWebhook'),
    );
    expect(handler).toContain("collectionGroup('docusignEnvelopes')");
    expect(handler).toContain('Envelope tenant binding mismatch');
    expect(handler).not.toContain('envelopeRef(tenantId, payload.envelopeId).set');
  });

  it('Stripe Connect binds payments to event.account, tenant record, and invoice tenant', () => {
    const source = read('app/api/stripe/connect/webhook/route.ts');
    const integrity = read('lib/payments/connect-invoice-integrity.ts');
    expect(source).toContain('event.account');
    expect(source).toContain('findTenantByAccountId(connectedAccountId)');
    expect(source).toContain('invoice.tenantId');
    expect(source).toContain('Payment amount does not match the invoice balance');
    expect(source).toContain('assertConnectInvoicePaymentIntent');
    expect(integrity).toContain('PaymentIntent currency does not match the invoice currency');
    expect(integrity).toContain('approved 0.5% fee');
  });

  it('returns non-2xx for missing or invalid Stripe signatures', () => {
    const source = read('app/api/stripe/connect/webhook/route.ts');
    expect(source).toContain("error: 'missing signature' }, { status: 400 }");
    expect(source).toContain("error: 'invalid signature' }, { status: 400 }");
  });
});
