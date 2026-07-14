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

const PATH_TO_MODULE: Record<string, string> = {
  '/finance': 'finance',
  '/sales': 'sales',
  '/sales_manager': 'sales',
  '/hr': 'hr',
  '/production': 'production',
  '/production_manager': 'production',
  '/am': 'sales',
  '/am_manager': 'sales',
  '/clients': 'clients',
  '/projects': 'projects',
  '/reports': 'reports',
  '/billing': 'billing',
  '/crm': 'crm',
  '/inventory': 'inventory',
  '/approvals': 'approvals',
  '/support': 'support',
  '/notifications': 'notifications',
};

function resolveModuleForPath(pathname: string): string | null {
  const matched = Object.entries(PATH_TO_MODULE).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return matched?.[1] || null;
}

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

function isPublicApiPath(pathname: string) {
  return (
    pathname.startsWith('/api/stripe') ||
    pathname.startsWith('/api/webhooks/stripe') ||
    pathname.startsWith('/api/session-login') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/tenant/context') ||
    pathname.startsWith('/api/subscription/status') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/signup') ||
    pathname.startsWith('/api/client/invites/') ||
    pathname.startsWith('/api/auth')
  );
}

function isSensitiveApiPath(pathname: string) {
  return (
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/ingest') ||
    pathname.startsWith('/api/super-admin') ||
    pathname.startsWith('/api/super_admin')
  );
}

function shouldSkipCsrfCheck(pathname: string): boolean {
  return (
    pathname.startsWith('/api/stripe/') ||
    pathname.startsWith('/api/webhooks/stripe') ||
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

  // Skip tenant validation for login/signup pages
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api/session-login')
  ) {
    return NextResponse.next();
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

  if ((pageRole || isApiRequest) && !sessionToken) {
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
    (Boolean(pageRole) || isApiRequest) &&
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
  ],
};
