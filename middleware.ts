// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("lac_session")?.value;

  // Public: root (/) and /login are public pages
  if (pathname === "/" || pathname.startsWith("/login")) {
    // already signed in? don't let them see the login page
    if (token && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Protected sections require token
  const protectedPrefixes = [
    "/admin",
    "/sales",
    "/am",
    "/finance",
    "/production",
    "/hr",
    "/client",
  ];

  if (protectedPrefixes.some(p => pathname.startsWith(p))) {
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
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/hr/:path*",
    "/client/:path*",
  ],
};
