// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("lac_session")?.value;

  // Public routes
  if (pathname.startsWith("/login")) {
    // If signed in, skip login → go to root
    if (token) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  // Require token for all protected routes
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sales") ||
    pathname.startsWith("/am") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/production") ||
    pathname.startsWith("/hr") ||
    pathname.startsWith("/client")
  ) {
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/hr/:path*",
    "/client/:path*",
    "/login/:path*",
  ],
};
