import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("lac_session")?.value;
  const { pathname } = req.nextUrl;

  // Public routes: "/" and "/login"
  if (pathname === "/" || pathname.startsWith("/login")) {
    // already signed in? send to root (which handles redirect to correct role)
    if (token && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Protected role routes
  const protectedPrefixes = [
    "/admin",
    "/sales",
    "/am",
    "/finance",
    "/production",
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
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/hr/:path*",
    "/client/:path*",
  ],
};
