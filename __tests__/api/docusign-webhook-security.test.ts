/**
 * SOC2 F-22 / F-23 regression suite.
 *
 * Two defects combined into an unauthenticated cross-tenant write:
 *
 *   F-22 — `verifyDocusignWebhookSignature` returned `true` when
 *   DOCUSIGN_WEBHOOK_SECRET was unset. The integration is deferred and the variable
 *   is blank, so in production the route authenticated every request it received.
 *
 *   F-23 — the route then read `tenantId` straight from the request body and wrote
 *   to tenants/{tenantId}/docusignEnvelopes/{envelopeId}. `sendEnvelopeForSignature`
 *   never puts a tenantId into the envelope it sends to DocuSign, so Connect cannot
 *   echo one back: the field had no legitimate producer and could only ever be set
 *   by the caller. Any unauthenticated party could therefore write envelope status
 *   into any tenant, and a status of "completed" additionally triggered a document
 *   download against that tenant's DocuSign connection.
 *
 * The tenant is now resolved solely from the stored envelope, which is written at
 * send time and is the only trustworthy envelope-to-tenant binding.
 */

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {},
}));

describe('verifyDocusignWebhookSignature', () => {
  const ORIGINAL = process.env.DOCUSIGN_WEBHOOK_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.DOCUSIGN_WEBHOOK_SECRET;
    else process.env.DOCUSIGN_WEBHOOK_SECRET = ORIGINAL;
    jest.resetModules();
  });

  it('fails closed when no webhook secret is configured', async () => {
    delete process.env.DOCUSIGN_WEBHOOK_SECRET;
    const { verifyDocusignWebhookSignature } = await import('@/lib/integrations/docusign');

    // Previously returned true, authenticating every unsigned request.
    expect(verifyDocusignWebhookSignature('{"any":"body"}', null)).toBe(false);
    expect(verifyDocusignWebhookSignature('{"any":"body"}', 'anything')).toBe(false);
  });

  it('rejects a request with no signature header when a secret IS configured', async () => {
    process.env.DOCUSIGN_WEBHOOK_SECRET = 'test-secret';
    const { verifyDocusignWebhookSignature } = await import('@/lib/integrations/docusign');

    expect(verifyDocusignWebhookSignature('{"any":"body"}', null)).toBe(false);
  });

  it('accepts a correctly signed body when a secret is configured', async () => {
    process.env.DOCUSIGN_WEBHOOK_SECRET = 'test-secret';
    const crypto = await import('crypto');
    const { verifyDocusignWebhookSignature } = await import('@/lib/integrations/docusign');

    const body = '{"data":{"envelopeId":"env_1","status":"sent"}}';
    const digest = crypto.createHmac('sha256', 'test-secret').update(body).digest('base64');

    expect(verifyDocusignWebhookSignature(body, digest)).toBe(true);
  });
});

describe('docusign webhook route payload extraction', () => {
  it('never carries a tenantId out of the request body', async () => {
    const source = require('fs').readFileSync(
      require('path').join(process.cwd(), 'app/api/integrations/docusign/webhook/route.ts'),
      'utf8',
    );

    // The tenant must be derived from stored state, never from the payload.
    expect(source).not.toMatch(/payload\?\.data\?\.tenantId/);
    expect(source).not.toMatch(/payload\?\.tenantId/);
  });
});
