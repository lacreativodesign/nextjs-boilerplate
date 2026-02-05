import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isHardLockedSubscription,
  isReadOnlySubscription,
  normalizeSubscriptionState,
} from "@/lib/subscription";
import { normalizeRole, roleFromPath, rolesAllowedForApi } from "@/lib/erpAccess";

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

function redirectLegacyPath(req: NextRequest, from: RegExp, to: string) {
  const { pathname } = req.nextUrl;
  if (!from.test(pathname)) return null;
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = pathname.replace(from, to);
  return NextResponse.redirect(redirectUrl, 308);
}

export async function middleware(req: NextRequest) {
  if (req.headers.get("x-middleware-prefetch") === "1") {
    return NextResponse.next();
  }

  const token = req.cookies.get("lac_session")?.value;
  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith("/api");

  const legacyRedirect =
    redirectLegacyPath(req, /^\/account_manager/, "/am") ||
    redirectLegacyPath(req, /^\/sales-manager/, "/sales_manager") ||
    redirectLegacyPath(req, /^\/super-admin/, "/super_admin") ||
    redirectLegacyPath(req, /^\/am-manager/, "/am_manager") ||
    redirectLegacyPath(req, /^\/production-manager/, "/production_manager") ||
    redirectLegacyPath(req, /^\/customer/, "/client");

  if (legacyRedirect) return legacyRedirect;

  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/set-password")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api/stripe") ||
    pathname.startsWith("/api/webhooks/stripe") ||
    pathname.startsWith("/api/session-login") ||
    pathname.startsWith("/api/logout") ||
    pathname.startsWith("/api/tenant/context") ||
    pathname.startsWith("/api/subscription/status")
  ) {
    return NextResponse.next();
  }

  const pageRole = roleFromPath(pathname);

  if ((pageRole || isApiRequest) && !token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const requiresSubscriptionCheck = Boolean(token) && (Boolean(pageRole) || isApiRequest) && !pathname.startsWith("/billing");

  let sessionRole = normalizeRole(null);

  if (requiresSubscriptionCheck) {
    const status = await fetchSubscriptionStatus(req);
    sessionRole = normalizeRole(status?.role);
    const subscriptionState = normalizeSubscriptionState(status?.subscriptionState);

    if (sessionRole !== "super_admin") {
      if (isHardLockedSubscription(subscriptionState)) {
        if (isApiRequest) {
          return NextResponse.json(
            { ok: false, error: "Subscription locked. Please update billing." },
            { status: 403 }
          );
        }
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/billing";
        return NextResponse.redirect(redirectUrl);
      }

      if (isApiRequest && isReadOnlySubscription(subscriptionState)) {
        const method = req.method.toUpperCase();
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
          return NextResponse.json(
            { ok: false, error: "Subscription is read-only. Mutations are disabled." },
            { status: 403 }
          );
        }
      }
    }
  }

  if (pageRole && sessionRole && pageRole !== sessionRole) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/unauthorized";
    return NextResponse.redirect(redirectUrl);
  }

  if (isApiRequest && sessionRole) {
    const allowedRoles = rolesAllowedForApi(pathname);
    if (allowedRoles && !allowedRoles.includes(sessionRole)) {
      return NextResponse.json({ ok: false, error: "Unauthorized for this API scope." }, { status: 403 });
    }
  }

  return NextResponse.next();
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
};
