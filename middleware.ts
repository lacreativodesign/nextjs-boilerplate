import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const session = req.cookies.get("lac_session")?.value;

  // ✅ If user is logged in and hits /login → redirect them to their dashboard
  if (pathname.startsWith("/login")) {
    if (session) {
      return NextResponse.redirect(
        new URL("/admin", req.url) // default fallback redirect
      );
    }
    return NextResponse.next();
  }

  // ✅ Protect all dashboard sections
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sales") ||
    pathname.startsWith("/am") ||
    pathname.startsWith("/hr") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/production") ||
    pathname.startsWith("/client")
  ) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/hr/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/client/:path*"
  ],
};
