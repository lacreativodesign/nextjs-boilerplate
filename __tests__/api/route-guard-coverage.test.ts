import fs from 'fs';
import path from 'path';

/**
 * Static guard-coverage gate.
 * Every mutation route (POST/PUT/PATCH/DELETE) under app/api must either
 * reference an approved auth/guard mechanism, or be on the reviewed PUBLIC
 * allowlist below. This prevents a future route from shipping wide open.
 * If you add a route that legitimately needs to be public, add it to
 * PUBLIC_ALLOWLIST with a justifying comment in the same PR.
 */

const API_ROOT = path.join(process.cwd(), 'app', 'api');

// Approved auth / guard mechanisms (named guards, internal signing, webhook
// signatures, ingest keys). Matched against raw file text. Rate limiting and a
// spoofable x-tenant-id header are NOT authorization and are intentionally excluded.
const GUARD_PATTERNS = [
  'require[A-Z][A-Za-z]+',
  'getCurrentUser',
  'getCurrentUserOrThrow',
  'getSessionUser',
  'getAmUser',
  'getProductionUser',
  'getResourcePlannerUser',
  'getUserProfile',
  'can[A-Z][A-Za-z]+',
  'assertPermission',
  'ensureClientPortalAccess',
  'ensureClientAccountActivation',
  'getTenantIdForRequest',
  'getTenantIdForRequestOrThrow',
  'authenticateIngest',
  'INTERNAL_REQUEST_SIGNING_SECRET',
  'INTERNAL_USAGE_LOG_KEY',
  'x-internal-secret',
  'x-internal-usage-key',
  'CRON_SECRET',
  'stripe-signature',
  'constructEvent',
  'verifyAndConstructBillingEvent',
  'verifySlackSignature',
  'verify[A-Za-z]+Signature',
  '[a-z]+-signature',
  'x-slack-signature',
  'x-api-key',
];
const GUARD_RE = new RegExp(GUARD_PATTERNS.join('|'));

// Detects an exported mutation handler.
const MUTATION_RE =
  /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b|export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=/;

// Reviewed routes that are intentionally public (pre-auth flows protected by
// OTP/invite/reset tokens, public invoice payment tokens, deprecated 410 stubs,
// browser telemetry, redirect-only, versioned proxy catch-alls, and the Stripe
// checkout entrypoint hardened in the Stripe sprint).
const PUBLIC_ALLOWLIST = new Set<string>([
  'auth/request-password-reset',
  'auth/send-otp',
  'auth/verify-otp',
  'auth/consume-set-password-token',
  'signup',
  'session-login',
  'login-stamp',
  'logout',
  'client/invites/complete',
  'users/accept-invitation',
  'public/invoice/[invoiceId]/pay',
  'public/invoice/[invoiceId]/confirm',
  'monitoring/ingest',
  'invoices/search',
  'v1/[[...path]]',
  'v2/[[...path]]',
  'webhooks/stripe',
  'payments/webhooks',
  'stripe/checkout',
  // Deprecated 410 stubs: return 410 unconditionally, no auth needed, no data access.
  'billing/subscribe',
  'billing/webhook',
]);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

describe('route guard coverage', () => {
  it('every mutation route is guarded or explicitly allowlisted', () => {
    const violations: string[] = [];
    for (const file of walk(API_ROOT)) {
      const src = fs.readFileSync(file, 'utf8');
      if (!MUTATION_RE.test(src)) continue;
      const rel = path
        .relative(API_ROOT, file)
        .replace(/\\/g, '/')
        .replace(/\/route\.ts$/, '');
      if (GUARD_RE.test(src)) continue;
      if (PUBLIC_ALLOWLIST.has(rel)) continue;
      violations.push(rel);
    }
    if (violations.length > 0) {
      throw new Error(
        'Unguarded mutation route(s) found. Add an auth guard, or if ' +
          'intentionally public, add to PUBLIC_ALLOWLIST with justification:\n' +
          violations.map((v) => '  - ' + v).join('\n'),
      );
    }
    expect(violations).toEqual([]);
  });
});
