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

  if (pathname === "/super_admin" || pathname.startsWith("/super_admin/")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/super_admin/, "/super-admin");
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
  const protectedPrefixes = ["/admin", "/super-admin", "/sales", "/sales-manager", "/am", "/finance", "/production", "/hr", "/client"];

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
    "/super_admin/:path*",
    "/customer/:path*",
    "/admin/:path*",
    "/super-admin/:path*",
    "/sales/:path*",
    "/sales-manager/:path*",
    "/am/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/hr/:path*",
    "/client/:path*",
  ],
};
