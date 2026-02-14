import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import {
  isHardLockedSubscription,
  isReadOnlySubscription,
  normalizeSubscriptionState,
} from "@/lib/subscription";
import { normalizeRole, roleFromPath, rolesAllowedForApi } from "@/lib/erpAccess";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import {
  applyRateLimitHeaders,
  applySecurityHeaders,
  getClientIp,
} from "@/lib/security";
import { verifyRequestSignature, verifyRotatingApiKey } from "@/lib/security/request-signing";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit/limiter";
import { applyVersionHeaders, getApiVersion } from "@/lib/api/versioning";

async function fetchSubscriptionStatus(req: NextRequest) {
  try {
    const res = await fetch(new URL("/api/subscription/status", req.url), {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
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

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function resolveTenantId(req: NextRequest) {
  return req.headers.get("x-tenant-id") || req.cookies.get("tenant_id")?.value || "unknown";
}

function resolveUserId(req: NextRequest) {
  const headerUser = req.headers.get("x-user-id");
  if (headerUser) return headerUser;
  const sessionToken = req.cookies.get("lac_session")?.value;
  if (sessionToken) return `session:${hash(sessionToken)}`;
  return `ip:${getClientIp(req)}`;
}

function queueUsageLog(event: NextFetchEvent, req: NextRequest, payload: Record<string, unknown>) {
  const secret = process.env.INTERNAL_USAGE_LOG_KEY;
  if (!secret) return;

  event.waitUntil(
    fetch(new URL("/api/internal/usage-log", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-usage-key": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }).catch(() => undefined)
  );
}

function jsonError(req: NextRequest, status: number, message: string, code: "FORBIDDEN" | "UNAUTHORIZED" | "SUBSCRIPTION_LOCKED" | "SUBSCRIPTION_READ_ONLY") {
  const { body } = resolveErrorResponse(
    new AppError({ message, code, status }),
    { requestId: req.headers.get("x-request-id") || undefined }
  );
  return withSecurityHeaders(NextResponse.json(body, { status }));
}

function withSecurityHeaders(response: NextResponse) {
  return applySecurityHeaders(response);
}

function isSuspiciousPath(req: NextRequest): boolean {
  const rawUrl = req.nextUrl.href.toLowerCase();
  const pathname = req.nextUrl.pathname.toLowerCase();
  return (
    pathname.includes("..")
    || rawUrl.includes("%2e%2e")
    || rawUrl.includes("%2f")
    || rawUrl.includes("%5c")
  );
}

function redirectLegacyPath(req: NextRequest, from: RegExp, to: string) {
  const { pathname } = req.nextUrl;
  if (!from.test(pathname)) return null;
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = pathname.replace(from, to);
  return NextResponse.redirect(redirectUrl, 308);
}

function isPublicApiPath(pathname: string) {
  return (
    pathname.startsWith("/api/stripe")
    || pathname.startsWith("/api/webhooks/stripe")
    || pathname.startsWith("/api/session-login")
    || pathname.startsWith("/api/logout")
    || pathname.startsWith("/api/tenant/context")
    || pathname.startsWith("/api/subscription/status")
    || pathname.startsWith("/api/public")
  );
}

function isSensitiveApiPath(pathname: string) {
  return pathname.startsWith("/api/cron")
    || pathname.startsWith("/api/ingest")
    || pathname.startsWith("/api/super-admin")
    || pathname.startsWith("/api/super_admin");
}

function applyRateHeaders(pathname: string, response: NextResponse, rateContext?: {
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}) {
  const responseWithVersionHeaders = applyVersionHeaders(response, pathname);
  if (rateContext) {
    applyRateLimitHeaders(responseWithVersionHeaders.headers, rateContext);
  }
  return withSecurityHeaders(responseWithVersionHeaders);
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (req.headers.get("x-middleware-prefetch") === "1") {
    return withSecurityHeaders(NextResponse.next());
  }

  const startedAt = Date.now();
  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith("/api");
  const apiVersion = getApiVersion(pathname);
  const isDeprecatedApiAlias = isApiRequest && apiVersion === "unversioned";

  if (pathname.startsWith("/api/internal/usage-log")) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (isSuspiciousPath(req)) {
    const ip = getClientIp(req);
    console.warn("Blocked suspicious request", { ip, pathname, method: req.method });
    if (isApiRequest) {
      const { body } = resolveErrorResponse(
        new AppError({
          message: "Suspicious request blocked.",
          code: "FORBIDDEN",
          status: 403,
        }),
        { requestId: req.headers.get("x-request-id") || undefined }
      );
      return withSecurityHeaders(NextResponse.json(body, { status: 403 }));
    }
    return withSecurityHeaders(new NextResponse("Suspicious request blocked.", { status: 403 }));
  }

  const sessionToken = req.cookies.get("lac_session")?.value;
  const tenantId = resolveTenantId(req);
  const userId = resolveUserId(req);

  let rateContext;
  let ruleId = "";
  let quotaExceeded = false;

  if (isApiRequest) {
    const decision = await checkRateLimit({
      tenantId,
      userId,
      ip: getClientIp(req),
      endpoint: pathname,
      method: req.method,
      timestamp: Date.now(),
    });

    ruleId = decision.ruleId;
    quotaExceeded = decision.reason === "QUOTA_EXCEEDED";

    if (!decision.allowed) {
      const body = {
        ok: false,
        error: decision.reason === "QUOTA_EXCEEDED" ? "Tenant API quota exceeded." : "Rate limit exceeded.",
        code: decision.reason === "QUOTA_EXCEEDED" ? "QUOTA_EXCEEDED" : "RATE_LIMITED",
      };
      const blocked = NextResponse.json(body, { status: 429 });
      Object.entries(buildRateLimitHeaders(decision)).forEach(([key, value]) => blocked.headers.set(key, value));
      if (decision.retryAfterSeconds > 0) blocked.headers.set("Retry-After", String(decision.retryAfterSeconds));

      queueUsageLog(event, req, {
        endpoint: pathname,
        apiVersion,
        isDeprecatedApiAlias,
        tenantId,
        userId,
        userEmail: req.headers.get("x-user-email") || "",
        ip: getClientIp(req),
        method: req.method,
        status: 429,
        responseTimeMs: Date.now() - startedAt,
        rateLimitRuleId: decision.ruleId,
        quotaExceeded,
        createdAt: new Date().toISOString(),
      });

      return applyRateHeaders(pathname, blocked, rateContext);
    }

    rateContext = {
      limit: decision.limit,
      remaining: decision.remaining,
      resetSeconds: decision.resetSeconds,
      retryAfterSeconds: 0,
    };
  }

  if (isApiRequest && isSensitiveApiPath(pathname)) {
    const apiKey = req.headers.get("x-api-key");
    const keyValidation = verifyRotatingApiKey(apiKey);
    if (!keyValidation.valid) {
      return applyRateHeaders(pathname, jsonError(req, 401, "Missing or invalid API key.", "UNAUTHORIZED"), rateContext);
    }

    const signature = req.headers.get("x-signature");
    const timestamp = req.headers.get("x-signature-timestamp");
    const signingSecret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || null;
    const payload = `${req.method.toUpperCase()}:${pathname}:${timestamp || ""}`;

    if (!(await verifyRequestSignature({ payload, signature, timestamp, secret: signingSecret }))) {
      return applyRateHeaders(pathname, jsonError(req, 401, "Invalid request signature.", "UNAUTHORIZED"), rateContext);
    }
  }

  const legacyRedirect =
    redirectLegacyPath(req, /^\/account_manager/, "/am") ||
    redirectLegacyPath(req, /^\/sales-manager/, "/sales_manager") ||
    redirectLegacyPath(req, /^\/super-admin/, "/super_admin") ||
    redirectLegacyPath(req, /^\/am-manager/, "/am_manager") ||
    redirectLegacyPath(req, /^\/production-manager/, "/production_manager") ||
    redirectLegacyPath(req, /^\/customer/, "/client");

  if (legacyRedirect) return applyRateHeaders(pathname, legacyRedirect, rateContext);

  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/set-password")) {
    return applyRateHeaders(pathname, NextResponse.next(), rateContext);
  }

  if (isApiRequest && isPublicApiPath(pathname)) {
    const res = applyRateHeaders(pathname, NextResponse.next(), rateContext);
    queueUsageLog(event, req, {
      endpoint: pathname,
      apiVersion,
      isDeprecatedApiAlias,
      tenantId,
      userId,
      userEmail: req.headers.get("x-user-email") || "",
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
      return applyRateHeaders(pathname, jsonError(req, 401, "Unauthorized", "UNAUTHORIZED"), rateContext);
    }
    return applyRateHeaders(pathname, NextResponse.redirect(new URL("/login", req.url)), rateContext);
  }

  const requiresSubscriptionCheck = Boolean(sessionToken) && (Boolean(pageRole) || isApiRequest) && !pathname.startsWith("/billing");

  let sessionRole = normalizeRole(null);

  if (requiresSubscriptionCheck) {
    const status = await fetchSubscriptionStatus(req);
    sessionRole = normalizeRole(status?.role);
    const subscriptionState = normalizeSubscriptionState(status?.subscriptionState);

    if (sessionRole !== "super_admin") {
      if (isHardLockedSubscription(subscriptionState)) {
        if (isApiRequest) {
          return applyRateHeaders(pathname, jsonError(req, 403, "Subscription locked. Please update billing.", "SUBSCRIPTION_LOCKED"), rateContext);
        }
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/billing";
        return applyRateHeaders(pathname, NextResponse.redirect(redirectUrl), rateContext);
      }

      if (isApiRequest && isReadOnlySubscription(subscriptionState)) {
        const method = req.method.toUpperCase();
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
          return applyRateHeaders(pathname, jsonError(req, 403, "Subscription is read-only. Mutations are disabled.", "SUBSCRIPTION_READ_ONLY"), rateContext);
        }
      }
    }
  }

  if (pageRole && sessionRole && pageRole !== sessionRole) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/unauthorized";
    return applyRateHeaders(pathname, NextResponse.redirect(redirectUrl), rateContext);
  }

  if (isApiRequest && sessionRole) {
    const allowedRoles = rolesAllowedForApi(pathname);
    if (allowedRoles && !allowedRoles.includes(sessionRole)) {
      return applyRateHeaders(pathname, jsonError(req, 403, "Unauthorized for this API scope.", "FORBIDDEN"), rateContext);
    }
  }

  const response = applyRateHeaders(pathname, NextResponse.next(), rateContext);

  if (isApiRequest) {
    queueUsageLog(event, req, {
      endpoint: pathname,
      apiVersion,
      isDeprecatedApiAlias,
      tenantId,
      userId,
      userEmail: req.headers.get("x-user-email") || "",
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
    "/",
    "/billing",
    "/billing/:path*",
    "/unauthorized",
    "/forbidden",
    "/login/:path*",
    "/account_manager/:path*",
    "/customer/:path*",
    "/api/:path*",
    "/admin/:path*",
    "/super_admin/:path*",
    "/super-admin/:path*",
    "/sales/:path*",
    "/sales-manager/:path*",
    "/sales_manager/:path*",
    "/am/:path*",
    "/am_manager/:path*",
    "/am-manager/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/production-manager/:path*",
    "/production_manager/:path*",
    "/hr/:path*",
    "/client/:path*",
  ],
  runtime: "nodejs",
};
