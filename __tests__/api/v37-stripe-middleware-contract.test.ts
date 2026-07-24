import fs from 'fs';
import path from 'path';

/**
 * P1-3 — the middleware Stripe exemption is scoped to genuinely public endpoints.
 *
 * middleware.ts used to treat everything under `/api/stripe` (and `/api/webhooks/stripe`) as
 * public, and skip CSRF for all of it. Two problems:
 *
 *   1. checkout, connect/start, connect/status and connect/disconnect run
 *      requireAdminOrSuperAdmin / requireTenantStripeConnect and read tenantId from the
 *      session. They are authenticated, state-changing routes, but the broad exemption waved
 *      them past the session gate AND skipped their CSRF check.
 *   2. `/api/webhooks/stripe` as a PREFIX also matched `/api/webhooks/subscriptions/*` and
 *      `/api/webhooks/deliveries/*` — authenticated admin management routes that share the
 *      `/api/webhooks/` segment.
 *
 * The route handlers' own guards were the last line of defence and still held (the P0-1 guard
 * proves tenant isolation across all mutation routes), so this was a defence-in-depth and CSRF
 * gap, not a confirmed breach. This test pins the exemption to exactly the four endpoints that
 * authenticate by signature or OAuth nonce, plus the deprecated 410 stub.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const MW = read('middleware.ts');

/** The only Stripe endpoints that are genuinely unauthenticated. */
const PUBLIC_STRIPE = [
  '/api/stripe/webhook',
  '/api/stripe/subscription-webhook',
  '/api/stripe/connect/webhook',
  '/api/stripe/connect/callback',
];

/** Authenticated, state-changing Stripe routes that must NOT be exempt. */
const PROTECTED_STRIPE = [
  'app/api/stripe/checkout/route.ts',
  'app/api/stripe/connect/start/route.ts',
  'app/api/stripe/connect/status/route.ts',
  'app/api/stripe/connect/disconnect/route.ts',
];

describe('P1-3: the exemption is an allowlist, not a prefix', () => {
  it('no longer treats the whole /api/stripe tree as public', () => {
    expect(MW).not.toContain("pathname.startsWith('/api/stripe')");
    expect(MW).not.toContain("pathname.startsWith('/api/stripe/')");
  });

  it('no longer treats the whole /api/webhooks/stripe prefix as public', () => {
    expect(MW).not.toMatch(/startsWith\('\/api\/webhooks\/stripe'\)/);
  });

  it('lists exactly the four signature/nonce-verified Stripe endpoints', () => {
    for (const route of PUBLIC_STRIPE) {
      expect(MW).toContain(`'${route}'`);
    }
  });

  it('matches the deprecated webhooks/stripe 410 stub by exact path', () => {
    expect(MW).toContain("pathname === '/api/webhooks/stripe'");
  });

  it('uses the same allowlist for the public gate and the CSRF skip', () => {
    const uses = MW.split('isPublicStripePath(pathname)').length - 1;
    expect(uses).toBeGreaterThanOrEqual(2);
  });
});

describe('P1-3: every exempt Stripe route actually authenticates without a session', () => {
  it('all three webhooks verify the stripe-signature header', () => {
    for (const rel of [
      'app/api/stripe/webhook/route.ts',
      'app/api/stripe/subscription-webhook/route.ts',
      'app/api/stripe/connect/webhook/route.ts',
    ]) {
      const src = read(rel);
      expect(src).toContain('stripe-signature');
      expect(src).toContain('constructEvent');
    }
  });

  it('the Connect OAuth callback validates a single-use state nonce', () => {
    const src = read('app/api/stripe/connect/callback/route.ts');
    expect(src).toContain('stripe_connect_oauth_states');
    expect(src).toContain("searchParams.get('state')");
  });
});

describe('P1-3: every non-exempt Stripe route still enforces its own auth', () => {
  it('checkout and connect/status require an admin or super_admin', () => {
    for (const rel of [
      'app/api/stripe/checkout/route.ts',
      'app/api/stripe/connect/status/route.ts',
    ]) {
      expect(read(rel)).toContain('requireAdminOrSuperAdmin');
    }
  });

  it('connect start and disconnect require a tenant with Stripe Connect', () => {
    for (const rel of [
      'app/api/stripe/connect/start/route.ts',
      'app/api/stripe/connect/disconnect/route.ts',
    ]) {
      expect(read(rel)).toContain('requireTenantStripeConnect');
    }
  });

  it('none of the protected routes is named in the public allowlist', () => {
    const allow = MW.slice(
      MW.indexOf('PUBLIC_STRIPE_PATHS'),
      MW.indexOf('function isPublicStripePath'),
    );
    for (const rel of PROTECTED_STRIPE) {
      const routePath = '/' + rel.replace(/^app\//, '').replace(/\/route\.ts$/, '');
      expect(allow).not.toContain(`'${routePath}'`);
    }
  });
});

describe('P1-3: the route contract still refuses to call checkout public', () => {
  it('stripe/checkout is not a key in PUBLIC_ROUTES', () => {
    const contract = read('lib/api/route-contract.ts');
    const publicBlock = contract.slice(
      contract.indexOf('PUBLIC_ROUTES'),
      contract.indexOf('AUTHENTICATED_ROUTES'),
    );
    expect(publicBlock).not.toMatch(/^\s*'stripe\/checkout'\s*:/m);
  });
});
