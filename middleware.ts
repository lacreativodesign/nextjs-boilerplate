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

  if (pathname === "/sales-manager" || pathname.startsWith("/sales-manager/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/sales-manager/, "/sales_manager");
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/super-admin/, "/super_admin");
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/am-manager" || pathname.startsWith("/am-manager/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/am-manager/, "/am_manager");
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/production-manager" || pathname.startsWith("/production-manager/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/production-manager/, "/production_manager");
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
    "/sales_manager",
    "/sales",
    "/am_manager",
    "/am",
    "/production_manager",
    "/production",
    "/finance",
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
    "/super-admin/:path*",
    "/super_admin/:path*",
    "/sales/:path*",
    "/sales-manager/:path*",
    "/sales_manager/:path*",
    "/am/:path*",
    "/am-manager/:path*",
    "/am_manager/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/production-manager/:path*",
    "/production_manager/:path*",
    "/hr/:path*",
    "/client/:path*",
  ],
};
