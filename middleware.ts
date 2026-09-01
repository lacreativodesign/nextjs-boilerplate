// Edge-compatible hash — no Node.js crypto needed
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import {
  isHardLockedSubscription,
  isReadOnlySubscription,
  normalizeSubscriptionState,
} from '@/lib/subscription';
import { normalizeRole, roleFromPath, rolesAllowedForApi } from '@/lib/erpAccess';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { applyRateLimitHeaders, applySecurityHeaders, getClientIp } from '@/lib/security';
import { buildStrictCsp, CSP_REPORT_URI } from '@/lib/security/headers';
import {
  verifyRequestSignature,
  verifyRotatingApiKey,
  signCacheValue,
  verifyCacheValue,
} from '@/lib/security/request-signing';
import { buildRateLimitHeaders, checkRateLimit } from '@/lib/rate-limit/limiter';
import { applyVersionHeaders, getApiVersion } from '@/lib/api/versioning';
import { PUBLIC_ROUTES } from '@/lib/api/route-contract';
import { resolveModuleForPath } from '@/lib/api/module-paths';

function shouldSkipModuleCheck(pathname: string): boolean {
  return (
    pathname.startsWith('/super_admin') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/module-disabled') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/unauthorized') ||
    pathname.startsWith('/forbidden') ||
    pathname.startsWith('/offline')
  );
}

function parseModuleCache(
  value: string | undefined,
): { tenantId: string; moduleKey: string; enabled: boolean; expiresAt: number } | null {
  if (!value) return null;
  const [tenantId, moduleKey, enabledValue, expiresAtValue] = value.split(':');
  const expiresAt = Number(expiresAtValue || 0);
  if (!tenantId || !moduleKey || Number.isNaN(expiresAt)) return null;
  return {
    tenantId,
    moduleKey,
    enabled: enabledValue === '1',
    expiresAt,
  };
}

async function parseSubCache(
  value: string | undefined,
): Promise<{ role: string; state: string; expiresAt: number } | null> {
  const secret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || '';
  const verified = await verifyCacheValue(value, secret);
  if (!verified) return null;
  const parts = verified.split(':');
  if (parts.length !== 3) return null;
  const [role, state, expiresAtStr] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!role || !state || isNaN(expiresAt)) return null;
  return { role, state, expiresAt };
}

async function buildSubCache(role: string, state: string): Promise<string | null> {
  const secret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || '';
  const raw = `${role}:${state}:${Date.now() + 60 * 1000}`;
  return signCacheValue(raw, secret);
}

async function fetchModuleEnabled(
  req: NextRequest,
  tenantId: string,
  moduleKey: string,
): Promise<boolean | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180);

  try {
    const url = new URL(
      `/api/tenant/module-check?tenantId=${encodeURIComponent(tenantId)}&module=${encodeURIComponent(moduleKey)}`,
      req.url,
    );
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'x-internal-secret': process.env.INTERNAL_REQUEST_SIGNING_SECRET || '',
      },
    });

    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json?.ok || typeof json?.enabled !== 'boolean') return null;
    return json.enabled;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSubscriptionStatus(req: NextRequest) {
  try {
    const res = await fetch(new URL('/api/subscription/status', req.url), {
      headers: {
        cookie: req.headers.get('cookie') || '',
      },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return null;
    }
    return json as { subscriptionState?: string; role?: string };
  } catch {
    return null;
  }
}

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).padStart(8, '0').slice(0, 24);
}

// Per-request CSP nonce. Web Crypto only (Edge runtime has no Node crypto):
// 16 random bytes → base64. Forwarded on x-nonce and used for the Report-Only
// strict CSP; the enforced CSP stays permissive so nothing is blocked.
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resolveTenantId(req: NextRequest) {
  // Do NOT trust an inbound x-tenant-id header — it is client-spoofable and would let a caller
  // poison or evade another tenant's rate-limit bucket and pollute usage logs. Use only the
  // server-set httpOnly tenant_id cookie (written at session-login from verified claims).
  return req.cookies.get('tenant_id')?.value || 'unknown';
}

function resolveUserId(req: NextRequest) {
  // Do NOT trust an inbound x-user-id header — it is client-spoofable. Derive the identity key from
  // the session cookie (non-spoofable), falling back to client IP for unauthenticated requests.
  const sessionToken = req.cookies.get('lac_session')?.value;
  if (sessionToken) return `session:${hash(sessionToken)}`;
  return `ip:${getClientIp(req)}`;
}

function queueUsageLog(event: NextFetchEvent, req: NextRequest, payload: Record<string, unknown>) {
  const secret = process.env.INTERNAL_USAGE_LOG_KEY;
  if (!secret) return;

  event.waitUntil(
    fetch(new URL('/api/internal/usage-log', req.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-usage-key': secret,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }).catch(() => undefined),
  );
}

function jsonError(
  req: NextRequest,
  status: number,
  message: string,
  code: 'FORBIDDEN' | 'UNAUTHORIZED' | 'SUBSCRIPTION_LOCKED' | 'SUBSCRIPTION_READ_ONLY',
) {
  const { body } = resolveErrorResponse(new AppError({ message, code, status }), {
    requestId: req.headers.get('x-request-id') || undefined,
  });
  return withSecurityHeaders(NextResponse.json(body, { status }));
}

function withSecurityHeaders(response: NextResponse, nonce?: string) {
  return applySecurityHeaders(response, nonce);
}

function isSuspiciousPath(req: NextRequest): boolean {
  const rawUrl = req.nextUrl.href.toLowerCase();
  const pathname = req.nextUrl.pathname.toLowerCase();
  return (
    pathname.includes('..') ||
    rawUrl.includes('%2e%2e') ||
    rawUrl.includes('%2f') ||
    rawUrl.includes('%5c')
  );
}

function redirectLegacyPath(req: NextRequest, from: RegExp, to: string) {
  const { pathname } = req.nextUrl;
  if (!from.test(pathname)) return null;
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = pathname.replace(from, to);
  return NextResponse.redirect(redirectUrl, 308);
}

function isPublicPagePath(pathname: string) {
  return pathname.startsWith('/pay');
}

// Shared authenticated shells that are not owned by any single role (roleFromPath returns
// null for them) but must still require a valid session and an unlocked subscription. Without
// this, these pages relied only on the client-side RequireAuth guard, so a direct URL hit was
// not stopped server-side. They are intentionally NOT role-restricted here — any signed-in
// role may use them; per-page RequireAuth allow-lists still apply on the client.
const PROTECTED_PAGE_PREFIXES = [
  '/settings',
  '/users',
  '/activity',
  '/onboarding',
  '/search',
  '/help',
];

function isProtectedPagePath(pathname: string) {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// A path is public if it matches one of the prefix families below (dynamic route groups whose
// members are all public), OR if its relative path is an exact key in the reviewed PUBLIC_ROUTES
// contract. Sourcing the static case from PUBLIC_ROUTES keeps middleware and the route contract
// from drifting apart (F5-01): previously this list was hand-maintained and omitted genuinely
// public endpoints such as monitoring/ingest, so anonymous telemetry received 401 (OBS-01).
// P1-3: only these Stripe endpoints are genuinely unauthenticated. Webhooks authenticate by
// verifying the stripe-signature header inside the route; the Connect OAuth callback
// authenticates by validating a single-use state nonce. Every OTHER /api/stripe/* route
// (checkout, connect/start, connect/status, connect/disconnect) runs requireAdminOrSuperAdmin
// or requireTenantStripeConnect and reads tenantId from the session — those must go through
// the normal session gate, not be waved through as public.
const PUBLIC_STRIPE_PATHS = new Set<string>([
  '/api/stripe/webhook',
  '/api/stripe/subscription-webhook',
  '/api/stripe/connect/webhook',
  '/api/stripe/connect/callback',
]);

function isPublicStripePath(pathname: string): boolean {
  // The deprecated /api/webhooks/stripe 410 stub is matched by exact path, NOT by prefix, so
  // it never covers the authenticated /api/webhooks/subscriptions and /api/webhooks/deliveries
  // admin management routes that share the /api/webhooks/ segment.
  return PUBLIC_STRIPE_PATHS.has(pathname) || pathname === '/api/webhooks/stripe';
}

function isPublicApiPath(pathname: string) {
  const prefixPublic =
    isPublicStripePath(pathname) ||
    pathname.startsWith('/api/session-login') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/tenant/context') ||
    pathname.startsWith('/api/subscription/status') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/signup') ||
    pathname.startsWith('/api/client/invites/') ||
    pathname.startsWith('/api/auth');
  if (prefixPublic) return true;
  // Exact-match against the reviewed public contract (static keys only; dynamic [param] keys are
  // covered by the prefix families above, e.g. /api/public/*).
  const relPath = pathname.replace(/^\/api\//, '');
  return Object.prototype.hasOwnProperty.call(PUBLIC_ROUTES, relPath);
}

/**
 * Routes gated by the PLATFORM's rotating key plus an HMAC signature.
 *
 * INGEST-1: `/api/ingest` was in this list, and that made the tenant ingest endpoints
 * impossible to call. The gate reads `x-api-key` and compares it against the platform's
 * own rotating keys — but a tenant website sends its TENANT key in that same header, so
 * verifyRotatingApiKey() rejected it and the request was answered with 401 before the
 * route ever ran. It then required an HMAC signed with INTERNAL_REQUEST_SIGNING_SECRET,
 * a platform secret no tenant has or should have. Two conditions, both unsatisfiable.
 *
 * The result was a documented feature that could not work: Settings → API Key tells a
 * tenant to "POST to /api/ingest/leads with the header x-api-key", and every such request
 * was rejected by middleware.
 *
 * Ingest is not unauthenticated now — it is authenticated at the ROUTE, which is the only
 * layer that can tell one tenant's key from another's. All four ingest routes call
 * authenticateIngest(), which resolves the key to exactly one tenant against a stored
 * hash, in constant time, header-only (KEY-1). That is strictly stronger than a shared
 * platform key, which identifies no tenant at all.
 *
 * Everything else in this list stays: cron and super_admin are genuinely platform-internal
 * and have no tenant-scoped credential to present.
 *
 * What ingest keeps: rate limiting, which runs earlier in this middleware and is unchanged.
 */
function isSensitiveApiPath(pathname: string) {
  return (
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/super-admin') ||
    pathname.startsWith('/api/super_admin')
  );
}

function shouldSkipCsrfCheck(pathname: string): boolean {
  return (
    // P1-3: CSRF is skipped only for the Stripe endpoints that are genuinely unauthenticated
    // (signature- or nonce-verified). checkout / connect start|status|disconnect are
    // authenticated, state-changing routes and must keep CSRF protection.
    isPublicStripePath(pathname) ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/ingest/') ||
    pathname.startsWith('/api/public/') ||
    // Auth endpoints called directly by login/signup forms (no CSRF header available)
    pathname.startsWith('/api/session-login') ||
    pathname.startsWith('/api/session-logout') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/signup') ||
    pathname.startsWith('/api/forgot-password') ||
    pathname.startsWith('/api/create-user') ||
    pathname.startsWith('/api/auth')
  );
}

function applyRateHeaders(
  pathname: string,
  response: NextResponse,
  rateContext?: {
    limit: number;
    remaining: number;
    resetSeconds: number;
    retryAfterSeconds: number;
  },
  nonce?: string,
) {
  const responseWithVersionHeaders = applyVersionHeaders(response, pathname);
  if (rateContext) {
    applyRateLimitHeaders(responseWithVersionHeaders.headers, rateContext);
  }
  return withSecurityHeaders(responseWithVersionHeaders, nonce);
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  // Per-request CSP nonce. Forwarded to the app on the x-nonce request header so
  // the root layout can attach it to its inline theme script, and used to emit
  // the Report-Only strict CSP with a matching nonce (enforced CSP stays permissive).
  const nonce = generateNonce();

  if (req.headers.get('x-middleware-prefetch') === '1') {
    return withSecurityHeaders(NextResponse.next(), nonce);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  // S15: Next.js stamps `nonce=` onto the script tags it generates ONLY when it can read a
  // nonce out of a Content-Security-Policy REQUEST header. Without this, Next's own
  // bootstrap and hydration scripts carry no nonce, so the strict nonce-based policy treats
  // the framework itself as a violation — which is exactly why enforcing it previously
  // produced a blank screen. This does not block anything: the ENFORCED response policy is
  // still the permissive one. It makes the Report-Only findings trustworthy, and is the
  // prerequisite for ever turning enforcement on.
  requestHeaders.set('Content-Security-Policy', buildStrictCsp(nonce, CSP_REPORT_URI));

  const startedAt = Date.now();
  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith('/api');
  const apiVersion = getApiVersion(pathname);
  const isDeprecatedApiAlias = isApiRequest && apiVersion === 'unversioned';

  if (pathname.startsWith('/api/internal/usage-log')) {
    return withSecurityHeaders(NextResponse.next(), nonce);
  }

  if (isSuspiciousPath(req)) {
    const ip = getClientIp(req);
    console.warn('Blocked suspicious request', { ip, pathname, method: req.method });
    if (isApiRequest) {
      const { body } = resolveErrorResponse(
        new AppError({
          message: 'Suspicious request blocked.',
          code: 'FORBIDDEN',
          status: 403,
        }),
        { requestId: req.headers.get('x-request-id') || undefined },
      );
      return withSecurityHeaders(NextResponse.json(body, { status: 403 }), nonce);
    }
    return withSecurityHeaders(
      new NextResponse('Suspicious request blocked.', { status: 403 }),
      nonce,
    );
  }

  const sessionToken = req.cookies.get('lac_session')?.value;
  const tenantId = resolveTenantId(req);
  const userId = resolveUserId(req);

  let rateContext;
  let ruleId = '';
  let quotaExceeded = false;

  if (isApiRequest) {
    const decision = await checkRateLimit({
      tenantId,
      userId,
      ip: getClientIp(req),
      endpoint: pathname,
      method: req.method,
      timestamp: Date.now(),
      authenticated: Boolean(sessionToken),
    });

    ruleId = decision.ruleId;
    quotaExceeded = decision.reason === 'QUOTA_EXCEEDED';

    if (!decision.allowed) {
      const body = {
        ok: false,
        error:
          decision.reason === 'QUOTA_EXCEEDED'
            ? 'Tenant API quota exceeded.'
            : 'Rate limit exceeded.',
        code: decision.reason === 'QUOTA_EXCEEDED' ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
      };
      const blocked = NextResponse.json(body, { status: 429 });
      Object.entries(buildRateLimitHeaders(decision)).forEach(([key, value]) =>
        blocked.headers.set(key, value),
      );
      if (decision.retryAfterSeconds > 0)
        blocked.headers.set('Retry-After', String(decision.retryAfterSeconds));

      queueUsageLog(event, req, {
        endpoint: pathname,
        apiVersion,
        isDeprecatedApiAlias,
        tenantId,
        userId,
        userEmail: req.headers.get('x-user-email') || '',
        ip: getClientIp(req),
        method: req.method,
        status: 429,
        responseTimeMs: Date.now() - startedAt,
        rateLimitRuleId: decision.ruleId,
        quotaExceeded,
        createdAt: new Date().toISOString(),
      });

      return applyRateHeaders(pathname, blocked, rateContext, nonce);
    }

    rateContext = {
      limit: decision.limit,
      remaining: decision.remaining,
      resetSeconds: decision.resetSeconds,
      retryAfterSeconds: 0,
    };
  }

  // CSRF protection: state-changing API requests must include X-Requested-With header
  if (
    isApiRequest &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase()) &&
    !shouldSkipCsrfCheck(pathname)
  ) {
    if (req.headers.get('x-requested-with') !== 'XMLHttpRequest') {
      return withSecurityHeaders(
        NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 }),
        nonce,
      );
    }
  }

  if (isApiRequest && isSensitiveApiPath(pathname)) {
    // If request comes from a browser session (has lac_session cookie), skip rotating key check.
    // The route handler's requireSuperAdmin() will enforce authorization.
    const hasSessionCookie = Boolean(req.cookies.get('lac_session')?.value);
    if (!hasSessionCookie) {
      const apiKey = req.headers.get('x-api-key');
      const keyValidation = verifyRotatingApiKey(apiKey);
      if (!keyValidation.valid) {
        return applyRateHeaders(
          pathname,
          jsonError(req, 401, 'Missing or invalid API key.', 'UNAUTHORIZED'),
          rateContext,
          nonce,
        );
      }

      const signature = req.headers.get('x-signature');
      const timestamp = req.headers.get('x-signature-timestamp');
      const signingSecret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || null;
      const payload = `${req.method.toUpperCase()}:${pathname}:${timestamp || ''}`;

      if (
        !(await verifyRequestSignature({ payload, signature, timestamp, secret: signingSecret }))
      ) {
        return applyRateHeaders(
          pathname,
          jsonError(req, 401, 'Invalid request signature.', 'UNAUTHORIZED'),
          rateContext,
          nonce,
        );
      }
    }
  }

  const legacyRedirect =
    redirectLegacyPath(req, /^\/account_manager/, '/am') ||
    redirectLegacyPath(req, /^\/sales-manager/, '/sales_manager') ||
    redirectLegacyPath(req, /^\/super-admin/, '/super_admin') ||
    redirectLegacyPath(req, /^\/am-manager/, '/am_manager') ||
    redirectLegacyPath(req, /^\/production-manager/, '/production_manager') ||
    redirectLegacyPath(req, /^\/customer/, '/client');

  if (legacyRedirect) return applyRateHeaders(pathname, legacyRedirect, rateContext, nonce);

  // Skip tenant validation for login/signup pages.
  //
  // SOC2 F-07: this returned a BARE NextResponse.next(), which meant the three highest-value
  // unauthenticated surfaces on the platform — the login page, the signup funnel and the
  // session-login endpoint — shipped with no CSP, no HSTS, no X-Frame-Options and no
  // Referrer-Policy, and never received the x-nonce request header. Tenant validation is
  // still skipped (these routes have no tenant yet); only the response headers change.
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api/session-login')
  ) {
    return applyRateHeaders(
      pathname,
      NextResponse.next({ request: { headers: requestHeaders } }),
      rateContext,
      nonce,
    );
  }

  if (pathname === '/' || pathname.startsWith('/set-password') || isPublicPagePath(pathname)) {
    return applyRateHeaders(
      pathname,
      NextResponse.next({ request: { headers: requestHeaders } }),
      rateContext,
      nonce,
    );
  }

  if (isApiRequest && isPublicApiPath(pathname)) {
    const res = applyRateHeaders(
      pathname,
      NextResponse.next({ request: { headers: requestHeaders } }),
      rateContext,
      nonce,
    );
    queueUsageLog(event, req, {
      endpoint: pathname,
      apiVersion,
      isDeprecatedApiAlias,
      tenantId,
      userId,
      userEmail: req.headers.get('x-user-email') || '',
      ip: getClientIp(req),
      method: req.method,
      status: 200,
      responseTimeMs: Date.now() - startedAt,
      rateLimitRuleId: ruleId,
      quotaExceeded,
      createdAt: new Date().toISOString(),
    });
    return res;
  }

  const pageRole = roleFromPath(pathname);

  const isProtectedPage = !isApiRequest && isProtectedPagePath(pathname);

  if ((pageRole || isApiRequest || isProtectedPage) && !sessionToken) {
    if (isApiRequest) {
      return applyRateHeaders(
        pathname,
        jsonError(req, 401, 'Unauthorized', 'UNAUTHORIZED'),
        rateContext,
        nonce,
      );
    }
    return applyRateHeaders(
      pathname,
      NextResponse.redirect(new URL('/login', req.url)),
      rateContext,
      nonce,
    );
  }

  const requiresSubscriptionCheck =
    Boolean(sessionToken) &&
    (Boolean(pageRole) || isApiRequest || isProtectedPage) &&
    !pathname.startsWith('/billing');

  let sessionRole = normalizeRole(null);
  let subCacheValue: string | null = null;

  if (requiresSubscriptionCheck) {
    const cachedSub = await parseSubCache(req.cookies.get('sub_cache')?.value);
    let subscriptionState: ReturnType<typeof normalizeSubscriptionState>;

    if (cachedSub && cachedSub.expiresAt > Date.now()) {
      sessionRole = normalizeRole(cachedSub.role);
      subscriptionState = normalizeSubscriptionState(cachedSub.state);
    } else {
      const status = await fetchSubscriptionStatus(req);
      sessionRole = normalizeRole(status?.role);
      subscriptionState = normalizeSubscriptionState(status?.subscriptionState);
      subCacheValue = await buildSubCache(sessionRole ?? '', subscriptionState);
    }

    if (sessionRole !== 'super_admin') {
      if (isHardLockedSubscription(subscriptionState)) {
        if (isApiRequest) {
          return applyRateHeaders(
            pathname,
            jsonError(
              req,
              403,
              'Subscription locked. Please update billing.',
              'SUBSCRIPTION_LOCKED',
            ),
            rateContext,
            nonce,
          );
        }
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = '/billing';
        return applyRateHeaders(pathname, NextResponse.redirect(redirectUrl), rateContext, nonce);
      }

      if (isApiRequest && isReadOnlySubscription(subscriptionState)) {
        const method = req.method.toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          return applyRateHeaders(
            pathname,
            jsonError(
              req,
              403,
              'Subscription is read-only. Mutations are disabled.',
              'SUBSCRIPTION_READ_ONLY',
            ),
            rateContext,
            nonce,
          );
        }
      }
    }
  }

  if (pageRole && sessionRole && pageRole !== sessionRole) {
    // admin and super_admin can access all module paths
    if (sessionRole !== 'admin' && sessionRole !== 'super_admin') {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/unauthorized';
      return applyRateHeaders(pathname, NextResponse.redirect(redirectUrl), rateContext, nonce);
    }
  }

  if (!isApiRequest && sessionToken && !shouldSkipModuleCheck(pathname)) {
    const moduleKey = resolveModuleForPath(pathname);
    const cookieTenantId = req.cookies.get('tenant_id')?.value;

    if (moduleKey && cookieTenantId) {
      const cacheKey = `module_gate_${moduleKey}`;
      const cached = parseModuleCache(req.cookies.get(cacheKey)?.value);
      let moduleEnabled: boolean | null = null;

      if (
        cached &&
        cached.tenantId === cookieTenantId &&
        cached.moduleKey === moduleKey &&
        cached.expiresAt > Date.now()
      ) {
        moduleEnabled = cached.enabled;
      } else {
        moduleEnabled = await fetchModuleEnabled(req, cookieTenantId, moduleKey);
      }

      if (moduleEnabled === false) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = '/module-disabled';
        return applyRateHeaders(pathname, NextResponse.redirect(redirectUrl), rateContext, nonce);
      }

      if (moduleEnabled !== null) {
        const response = applyRateHeaders(
          pathname,
          NextResponse.next({ request: { headers: requestHeaders } }),
          rateContext,
          nonce,
        );
        response.headers.set(
          'x-module-check',
          `${moduleKey}:${moduleEnabled ? 'enabled' : 'disabled'}`,
        );
        response.cookies.set(
          cacheKey,
          `${cookieTenantId}:${moduleKey}:${moduleEnabled ? '1' : '0'}:${Date.now() + 30_000}`,
          {
            path: '/',
            maxAge: 30,
            sameSite: 'lax',
            httpOnly: true,
            secure: true,
          },
        );
        if (subCacheValue) {
          response.cookies.set('sub_cache', subCacheValue, {
            path: '/',
            maxAge: 60,
            sameSite: 'lax',
            httpOnly: true,
            secure: true,
          });
        }
        return response;
      }
    }
  }

  if (isApiRequest) {
    const allowedRoles = rolesAllowedForApi(pathname);
    // Fail closed: an API path with a defined role allow-list must have a resolved role that is in
    // the list. If the role could not be resolved (e.g. the subscription-status lookup failed) or is
    // not allowed, deny rather than letting the request through unchecked.
    if (allowedRoles && (!sessionRole || !allowedRoles.includes(sessionRole))) {
      return applyRateHeaders(
        pathname,
        jsonError(req, 403, 'Unauthorized for this API scope.', 'FORBIDDEN'),
        rateContext,
        nonce,
      );
    }
  }

  const response = applyRateHeaders(
    pathname,
    NextResponse.next({ request: { headers: requestHeaders } }),
    rateContext,
    nonce,
  );

  if (subCacheValue) {
    response.cookies.set('sub_cache', subCacheValue, {
      path: '/',
      maxAge: 60,
      sameSite: 'lax',
      httpOnly: true,
      secure: true,
    });
  }

  if (isApiRequest) {
    queueUsageLog(event, req, {
      endpoint: pathname,
      apiVersion,
      isDeprecatedApiAlias,
      tenantId,
      userId,
      userEmail: req.headers.get('x-user-email') || '',
      ip: getClientIp(req),
      method: req.method,
      status: response.status || 200,
      responseTimeMs: Date.now() - startedAt,
      rateLimitRuleId: ruleId,
      quotaExceeded,
      createdAt: new Date().toISOString(),
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/billing',
    '/billing/:path*',
    '/unauthorized',
    '/forbidden',
    '/login/:path*',
    // SOC2 F-07: /signup was absent from the matcher entirely, so middleware never ran for
    // the signup funnel and it received no security headers at all.
    '/signup/:path*',
    '/account_manager/:path*',
    '/customer/:path*',
    '/api/:path*',
    '/admin/:path*',
    '/super_admin/:path*',
    '/super-admin/:path*',
    '/sales/:path*',
    '/sales-manager/:path*',
    '/sales_manager/:path*',
    '/am/:path*',
    '/am_manager/:path*',
    '/am-manager/:path*',
    '/finance/:path*',
    '/production/:path*',
    '/production-manager/:path*',
    '/production_manager/:path*',
    '/hr/:path*',
    '/dashboard/:path*',
    '/clients/:path*',
    '/projects/:path*',
    '/reports/:path*',
    '/crm/:path*',
    '/inventory/:path*',
    '/approvals/:path*',
    '/support/:path*',
    '/notifications/:path*',
    '/client/:path*',
    '/pay/:path*',
    '/settings/:path*',
    '/settings',
    '/users/:path*',
    '/users',
    '/activity/:path*',
    '/activity',
    '/onboarding/:path*',
    '/onboarding',
    '/search/:path*',
    '/search',
    '/help/:path*',
    '/help',
  ],
};
