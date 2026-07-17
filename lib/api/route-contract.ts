/**
 * API route contracts (P0-5).
 *
 * Every route file under app/api must be classifiable into exactly one
 * contract. Classification is evidence-based: it is derived from the route's
 * own source (which guard it calls, which secret or signature it verifies) and
 * its path. A route with no evidence and no reviewed PUBLIC_ROUTES entry is
 * unclassified, and the route-guard-coverage test fails the build.
 *
 * Contracts:
 * - cron          path under cron/;   MUST verify CRON_SECRET / x-vercel-cron
 * - webhook       MUST verify a provider signature (stripe-signature, etc.)
 * - internal      MUST verify an internal signing secret / ingest key
 * - super_admin   path under super_admin/ or guarded by requireSuperAdmin
 * - tenant_scoped user-auth guard + tenant context evidence
 * - authenticated user-auth guard without explicit tenant evidence in-file
 *                 (tenant scoping may still happen inside the guard)
 * - public        reviewed entry in PUBLIC_ROUTES with a justification
 *
 * Rate limiting and the spoofable x-tenant-id header are NOT authorization
 * and are deliberately absent from the evidence lists.
 */

export type RouteContract =
  'public' | 'authenticated' | 'tenant_scoped' | 'super_admin' | 'webhook' | 'cron' | 'internal';

const CRON_EVIDENCE = [/CRON_SECRET/, /x-vercel-cron/];

const WEBHOOK_EVIDENCE = [
  /stripe-signature/,
  /constructEvent/,
  /verifyAndConstructBillingEvent/,
  /verify[A-Za-z]+Signature/,
  /x-slack-signature/,
  /[a-z]+-signature/,
];

const INTERNAL_EVIDENCE = [
  /INTERNAL_REQUEST_SIGNING_SECRET/,
  /INTERNAL_USAGE_LOG_KEY/,
  /x-internal-secret/,
  /x-internal-usage-key/,
  /authenticateIngest/,
  /x-api-key/,
];

const SUPER_ADMIN_EVIDENCE = [/requireSuperAdmin/];

const AUTH_EVIDENCE = [
  /require[A-Z][A-Za-z]+/,
  /getCurrentUser/,
  /getSessionUser/,
  /getAmUser/,
  /getProductionUser/,
  /getResourcePlannerUser/,
  /getUserProfile/,
  /can[A-Z][A-Za-z]+/,
  /assertPermission/,
  /ensureClientPortalAccess/,
  /ensureClientAccountActivation/,
  /getTenantIdForRequest/,
];

const TENANT_EVIDENCE = [
  /getTenantIdForRequest/,
  /docTenantId/,
  /normalizeTenantId/,
  // A route is tenant-scoped when it reads a resolved tenantId off the
  // authenticated principal and/or filters Firestore by it. The original list
  // only matched the literal `.user.tenantId`; real routes reach tenantId many
  // equivalent ways (me.tenantId, session.tenantId, object shorthand, where
  // filters, destructuring from the auth guard). These patterns recognize those
  // without matching mere mentions in comments.
  /\.tenantId\b/,
  /tenantId:\s/,
  /where\(['"]tenantId['"]/,
  /\{[^}]*\btenantId\b[^}]*\}\s*=\s*await/,
  /tenantId.*claims|claims.*tenantId/,
];

/**
 * Reviewed intentionally-public routes. Every entry needs a justification.
 * Pre-auth flows are protected by their own single-use tokens (OTP, invite,
 * reset, payment token) or OAuth state parameters — validated inside the route.
 */
export const PUBLIC_ROUTES: Record<string, string> = {
  'security/csp-report':
    'Browser CSP violation report sink; unauthenticated by spec, logs only, no data access.',
  // Pre-auth account flows (token/OTP protected inside the route)
  'auth/request-password-reset': 'Pre-auth: issues password reset email; token-gated completion.',
  'auth/send-otp': 'Pre-auth signup step; rate limited; OTP hashed at rest.',
  'auth/verify-otp': 'Pre-auth signup step; verifies hashed OTP.',
  'auth/consume-set-password-token': 'Pre-auth: HMAC set-password token is the credential.',
  signup: 'Pre-auth signup; requires verified OTP before any tenant is created.',
  'session-login': 'Login entrypoint; verifies Firebase idToken with checkRevoked.',
  'login-stamp': 'Login telemetry stamp during pre-session login flow.',
  logout: 'Clears session cookies; no data access.',
  'client/invites/complete': 'Client activation; hashed invite token is the credential.',
  'client/invites/validate': 'Validates hashed invite token before activation UI.',
  'users/accept-invitation': 'Staff activation; hashed invite token is the credential.',
  // Public payment surface (unguessable payment token is the credential)
  'public/invoice/[invoiceId]': 'Public invoice view; requires payment token query param.',
  'public/invoice/[invoiceId]/pay': 'Public invoice payment; payment token validated.',
  'public/invoice/[invoiceId]/confirm': 'Public payment confirmation; token validated.',
  // NOTE: stripe/checkout is NOT public. It calls requireAdminOrSuperAdmin and
  // reads auth.user.tenantId, so it classifies as tenant_scoped by evidence.
  // Do not re-add it here — that would hide the auth requirement behind a public
  // label and let the "public surface" grow silently.
  // OAuth/SSO callbacks (state parameter validated inside; integrations dormant)
  'auth/sso/[provider]/callback': 'OAuth callback; state validated in-route.',
  'auth/sso/providers': 'Pre-login list of enabled SSO providers; no tenant data.',
  'billing/terminal/oauth-callback': 'Stripe Terminal OAuth callback; state validated.',
  'stripe/connect/callback': 'Stripe Connect OAuth callback; state validated.',
  'integrations/calendly/callback': 'OAuth callback; state validated; integration dormant.',
  'integrations/google/callback': 'OAuth callback; state validated; integration dormant.',
  'integrations/microsoft/callback': 'OAuth callback; state validated; integration dormant.',
  'integrations/quickbooks/callback': 'OAuth callback; state validated; integration dormant.',
  'integrations/xero/callback': 'OAuth callback; state validated; integration dormant.',
  'integrations/google/gmail/open/[trackingId]': 'Email open tracking pixel; ID is the token.',
  'integrations/microsoft/outlook/open/[trackingId]': 'Email open tracking pixel; ID is the token.',
  // Operational/public metadata
  health: 'Liveness probe; returns status only.',
  'health/ready': 'Readiness probe; returns status only.',
  openapi: 'Public API specification document.',
  'public/firebase-config': 'Returns NEXT_PUBLIC Firebase config (already public values).',
  'i18n/languages': 'Static list of supported languages.',
  'i18n/translations/[locale]': 'Static translation bundles.',
  'currency/rates': 'Cached public exchange rates.',
  'finance/currency/rates': 'Cached public exchange rates (finance UI alias).',
  'monitoring/ingest': 'Browser telemetry; 8KB cap, field whitelist, ingest-keyed in prod.',
  'invoices/search': 'Public invoice lookup by unguessable token.',
  // Versioned proxy catch-alls (delegate to underlying guarded routes)
  'v1/[[...path]]': 'Versioned proxy; auth enforced by the proxied route.',
  'v2/[[...path]]': 'Versioned proxy; auth enforced by the proxied route.',
  // Deprecated endpoints: return 410 Gone unconditionally, no data access.
  'webhooks/stripe': 'Deprecated 410 stub.',
  'payments/webhooks': 'Deprecated 410 stub.',
  'billing/webhook': 'Deprecated 410 stub.',
  'billing/subscribe': 'Deprecated 410 stub.',
  'billing/cancel-subscription': 'Deprecated 410 stub.',
};

/**
 * Reviewed intentionally-authenticated (non-tenant-scoped) routes. Every entry
 * needs a justification. These are routes behind a user-auth guard that
 * legitimately do NOT scope by tenantId because they operate on the caller's own
 * identity, on global/platform-level data (super-admin), on stateless utilities,
 * or delegate to a tenant-scoped route. Any authenticated route NOT on this list
 * is a suspected missing-tenant-scope and fails the coverage gate.
 */
export const AUTHENTICATED_ROUTES: Record<string, string> = {
  // Caller-identity scoped (act on the current user, not a tenant collection)
  me: 'Returns the current user profile; scoped to the caller, not a tenant.',
  'auth/sessions': "Lists the caller's own sessions.",
  'auth/sessions/[id]': "Revokes one of the caller's own sessions.",
  'auth/sessions/invalidate-all': "Invalidates all of the caller's own sessions.",
  'auth/create-set-password-token': 'Issues a set-password token for the caller.',
  'auth/sso/status': 'Returns SSO status for the caller; no tenant data.',
  'auth/sso/[provider]/authorize':
    'Builds an OAuth authorize URL; tenantId is a query param, not tenant-scoped data access.',
  // Global / platform-level (super-admin, tenant-agnostic by design)
  'admin/rate-limits': 'Super-admin only; manages global rate-limit rules.',
  'admin/jobs/[id]/retry': 'Super-admin only; retries a platform job.',
  'admin/launch-checklist/check': 'Super-admin only; platform launch checklist.',
  'admin/monitoring/overview': 'Super-admin only; platform monitoring snapshot.',
  'finance/reports/platform': 'Super-admin only; platform-wide (cross-tenant) finance report.',
  // Stateless utility (no tenant data)
  'finance/currency/convert': 'Pure currency conversion math; no tenant data.',
  // Safe delegators (tenant scoping enforced by the route they call)
  'finance/invoices/mark-paid':
    'Delegates to finance/invoices/update (tenant-scoped) after requireFinance.',
  'finance/payments/record':
    'Delegates to finance/payments/update (tenant-scoped) after requireFinance.',
};

const matchesAny = (src: string, patterns: RegExp[]) => patterns.some((re) => re.test(src));

/**
 * Classifies one route file. Returns null when the route cannot be classified
 * — which the coverage test treats as a failure.
 *
 * Priority order matters: infrastructure contracts (cron, webhook, internal)
 * are checked first because their paths/secrets are unambiguous, then
 * super_admin, then user-auth contracts, then the reviewed public list.
 */
export function classifyRouteSource(relPath: string, src: string): RouteContract | null {
  const isCronPath = relPath.startsWith('cron/');
  if (isCronPath) {
    // A cron route without secret verification is a misconfiguration, not public.
    return matchesAny(src, CRON_EVIDENCE) ? 'cron' : null;
  }

  if (PUBLIC_ROUTES[relPath]) return 'public';

  const looksLikeWebhook = /(^|\/)webhooks?(\/|$)|-webhook(\/|$)/.test(relPath);
  if (matchesAny(src, WEBHOOK_EVIDENCE)) return 'webhook';

  if (matchesAny(src, INTERNAL_EVIDENCE)) return 'internal';

  const isSuperAdminPath = relPath.startsWith('super_admin/');
  if (matchesAny(src, SUPER_ADMIN_EVIDENCE)) return 'super_admin';
  // A super_admin route missing requireSuperAdmin must not ship.
  if (isSuperAdminPath) return null;

  if (matchesAny(src, AUTH_EVIDENCE)) {
    // Webhook-NAMED routes behind user auth are outbound-webhook management
    // (subscription CRUD, delivery logs), not inbound receivers.
    return matchesAny(src, TENANT_EVIDENCE) ? 'tenant_scoped' : 'authenticated';
  }

  // An inbound webhook route without signature verification must not ship.
  if (looksLikeWebhook) return null;

  return null;
}
