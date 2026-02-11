import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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
  checkRateLimit,
  getClientIp,
  verifyRequestSignature,
  verifyRotatingApiKey,
} from "@/lib/security";

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

function getRateLimitTier(pathname: string) {
  if (pathname.startsWith("/api/session-login") || pathname.startsWith("/api/logout") || pathname.startsWith("/api/auth")) return "strict";
  if (pathname.startsWith("/api/upload") || pathname.startsWith("/api/documents/upload") || pathname.startsWith("/api/production/files/upload")) return "upload";
  if (pathname.startsWith("/api/public") || pathname.startsWith("/api/subscription/status") || pathname.startsWith("/api/tenant/context")) return "relaxed";
  return "standard";
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

function applyRateHeaders(response: NextResponse, rateContext?: {
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}) {
  if (rateContext) {
    applyRateLimitHeaders(response.headers, rateContext);
  }
  return withSecurityHeaders(response);
}

export async function middleware(req: NextRequest) {
  if (req.headers.get("x-middleware-prefetch") === "1") {
    return withSecurityHeaders(NextResponse.next());
  }

  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith("/api");

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

  let rateContext;
  if (isApiRequest) {
    const tier = getRateLimitTier(pathname);
    const userIdentifier = sessionToken ? `session:${sessionToken.slice(0, 24)}` : undefined;
    try {
      rateContext = await checkRateLimit(req, tier, userIdentifier);
    } catch (error) {
      console.warn("Rate limit exceeded", { pathname, method: req.method, ip: getClientIp(req) });
      const { status, body } = resolveErrorResponse(error, {
        fallbackMessage: "Rate limit exceeded.",
        fallbackCode: "RATE_LIMITED",
        fallbackStatus: 429,
        requestId: req.headers.get("x-request-id") || undefined,
      });
      return applyRateHeaders(NextResponse.json(body, { status }), {
        limit: 0,
        remaining: 0,
        resetSeconds: 60,
        retryAfterSeconds: 60,
      });
    }

    if (isSensitiveApiPath(pathname)) {
      const apiKey = req.headers.get("x-api-key");
      const keyValidation = verifyRotatingApiKey(apiKey);
      if (!keyValidation.valid) {
        return applyRateHeaders(jsonError(req, 401, "Missing or invalid API key.", "UNAUTHORIZED"), rateContext);
      }

      const signature = req.headers.get("x-signature");
      const timestamp = req.headers.get("x-signature-timestamp");
      const signingSecret = process.env.INTERNAL_REQUEST_SIGNING_SECRET || null;
      const payload = `${req.method.toUpperCase()}:${pathname}:${timestamp || ""}`;

      if (!verifyRequestSignature({ payload, signature, timestamp, secret: signingSecret })) {
        return applyRateHeaders(jsonError(req, 401, "Invalid request signature.", "UNAUTHORIZED"), rateContext);
      }
    }
  }

  const legacyRedirect =
    redirectLegacyPath(req, /^\/account_manager/, "/am") ||
    redirectLegacyPath(req, /^\/sales-manager/, "/sales_manager") ||
    redirectLegacyPath(req, /^\/super-admin/, "/super_admin") ||
    redirectLegacyPath(req, /^\/am-manager/, "/am_manager") ||
    redirectLegacyPath(req, /^\/production-manager/, "/production_manager") ||
    redirectLegacyPath(req, /^\/customer/, "/client");

  if (legacyRedirect) return applyRateHeaders(legacyRedirect, rateContext);

  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/set-password")) {
    return applyRateHeaders(NextResponse.next(), rateContext);
  }

  if (isApiRequest && isPublicApiPath(pathname)) {
    return applyRateHeaders(NextResponse.next(), rateContext);
  }

  const pageRole = roleFromPath(pathname);

  if ((pageRole || isApiRequest) && !sessionToken) {
    if (isApiRequest) {
      return applyRateHeaders(jsonError(req, 401, "Unauthorized", "UNAUTHORIZED"), rateContext);
    }
    return applyRateHeaders(NextResponse.redirect(new URL("/login", req.url)), rateContext);
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
          return applyRateHeaders(jsonError(req, 403, "Subscription locked. Please update billing.", "SUBSCRIPTION_LOCKED"), rateContext);
        }
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/billing";
        return applyRateHeaders(NextResponse.redirect(redirectUrl), rateContext);
      }

      if (isApiRequest && isReadOnlySubscription(subscriptionState)) {
        const method = req.method.toUpperCase();
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
          return applyRateHeaders(jsonError(req, 403, "Subscription is read-only. Mutations are disabled.", "SUBSCRIPTION_READ_ONLY"), rateContext);
        }
      }
    }
  }

  if (pageRole && sessionRole && pageRole !== sessionRole) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/unauthorized";
    return applyRateHeaders(NextResponse.redirect(redirectUrl), rateContext);
  }

  if (isApiRequest && sessionRole) {
    const allowedRoles = rolesAllowedForApi(pathname);
    if (allowedRoles && !allowedRoles.includes(sessionRole)) {
      return applyRateHeaders(jsonError(req, 403, "Unauthorized for this API scope.", "FORBIDDEN"), rateContext);
    }
  }

  return applyRateHeaders(NextResponse.next(), rateContext);
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
