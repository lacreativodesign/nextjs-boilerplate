import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRouteAccessForPath } from "@/lib/auth/roles";

export function middleware(req: NextRequest) {
  if (req.headers.get("x-middleware-prefetch") === "1") {
    return NextResponse.next();
  }
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("lac_session")?.value;
  const roleCookie = req.cookies.get("lac_role")?.value || "";

  if (pathname === "/super_admin" || pathname.startsWith("/super_admin/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/super_admin/, "/super-admin");
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/account_manager" || pathname.startsWith("/account_manager/")) {
    const rewrittenPath = pathname.replace(/^\/account_manager/, "/am");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = rewrittenPath;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/customer" || pathname.startsWith("/customer/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/customer/, "/client");
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/client/settings" || pathname.startsWith("/client/settings/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/client\/settings/, "/client/profile");
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Public routes: "/" and "/login"
  if (pathname === "/" || pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/forbidden") ||
    pathname.startsWith("/module-disabled") ||
    pathname.startsWith("/suspended")
  ) {
    return NextResponse.next();
  }

  const access = getRouteAccessForPath(pathname);
  if (!access) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (roleCookie) {
    const allowed = access.roles;
    const normalizedRole = roleCookie.toLowerCase();
    if (!allowed.includes(normalizedRole as typeof allowed[number])) {
      return NextResponse.redirect(new URL("/forbidden", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login/:path*",
    "/super_admin/:path*",
    "/super-admin/:path*",
    "/account_manager/:path*",
    "/customer/:path*",
    "/client/settings/:path*",
    "/admin/:path*",
    "/sales/:path*",
    "/sales-manager/:path*",
    "/am-manager/:path*",
    "/production-manager/:path*",
    "/am/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/hr/:path*",
    "/client/:path*",
    "/forbidden/:path*",
    "/module-disabled/:path*",
    "/suspended/:path*",
  ],
};
