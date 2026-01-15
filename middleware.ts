import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.headers.get("x-middleware-prefetch") === "1") {
    return NextResponse.next();
  }
  const token = req.cookies.get("lac_session")?.value;
  const { pathname } = req.nextUrl;

  if (pathname === "/account_manager" || pathname.startsWith("/account_manager/")) {
    const rewrittenPath = pathname.replace(/^\/account_manager/, "/am");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/sales_manager" || pathname.startsWith("/sales_manager/")) {
    const rewrittenPath = pathname.replace(/^\/sales_manager/, "/sales-manager");
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
  if (pathname === "/" || pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // Protected role routes
  const protectedPrefixes = [
    "/admin",
    "/super_admin",
    "/sales",
    "/sales-manager",
    "/sales_manager",
    "/am",
    "/am_manager",
    "/finance",
    "/production",
    "/production_manager",
    "/hr",
    "/client",
  ];

  // if user not logged in, redirect to login
  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login/:path*",
    "/account_manager/:path*",
    "/customer/:path*",
    "/admin/:path*",
    "/super_admin/:path*",
    "/sales/:path*",
    "/sales-manager/:path*",
    "/sales_manager/:path*",
    "/am/:path*",
    "/am_manager/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/production_manager/:path*",
    "/hr/:path*",
    "/client/:path*",
  ],
};
