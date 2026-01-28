import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isHardLockedSubscription,
  isReadOnlySubscription,
  normalizeSubscriptionState,
} from "@/lib/subscription";

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

export async function middleware(req: NextRequest) {
  if (req.headers.get("x-middleware-prefetch") === "1") {
    return NextResponse.next();
  }
  const token = req.cookies.get("lac_session")?.value;
  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith("/api");

  if (pathname === "/account_manager" || pathname.startsWith("/account_manager/")) {
    const rewrittenPath = pathname.replace(/^\/account_manager/, "/am");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/sales-manager" || pathname.startsWith("/sales-manager/")) {
    const rewrittenPath = pathname.replace(/^\/sales-manager/, "/sales_manager");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
    const rewrittenPath = pathname.replace(/^\/super-admin/, "/super_admin");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/am-manager" || pathname.startsWith("/am-manager/")) {
    const rewrittenPath = pathname.replace(/^\/am-manager/, "/am_manager");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/production-manager" || pathname.startsWith("/production-manager/")) {
    const rewrittenPath = pathname.replace(/^\/production-manager/, "/production_manager");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/customer" || pathname.startsWith("/customer/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/customer/, "/client");
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Public routes: "/" and "/login"
  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/set-password")) {
    return NextResponse.next();
  }

  // Protected role routes
  const protectedPrefixes = [
    "/admin",
    "/super_admin",
    "/sales",
    "/sales_manager",
    "/am",
    "/am_manager",
    "/finance",
    "/production",
    "/production_manager",
    "/hr",
    "/client",
  ];

  if (
    pathname.startsWith("/api/stripe") ||
    pathname.startsWith("/api/webhooks/stripe") ||
    pathname.startsWith("/api/session-login") ||
    pathname.startsWith("/api/logout")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/tenant/context") || pathname.startsWith("/api/subscription/status")) {
    return NextResponse.next();
  }

  // if user not logged in, redirect to login
  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Enforce subscription lock states for authenticated users without blocking public/auth routes.
  const requiresSubscriptionCheck =
    Boolean(token) &&
    (protectedPrefixes.some((prefix) => pathname.startsWith(prefix)) || isApiRequest) &&
    !pathname.startsWith("/billing");

  if (requiresSubscriptionCheck) {
    const status = await fetchSubscriptionStatus(req);
    const role = String(status?.role || "").toLowerCase();
    const subscriptionState = normalizeSubscriptionState(status?.subscriptionState);

    if (role !== "super_admin") {
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/billing",
    "/billing/:path*",
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
