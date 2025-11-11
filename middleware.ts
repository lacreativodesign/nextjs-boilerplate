import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public route: login
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // ✅ Correct cookie name
  const cookie = req.cookies.get("lac_session")?.value;

  // ✅ No cookie → force login
  if (!cookie) {
    return NextResponse.redirect("https://login.lacreativo.com");
  }

  // ✅ Do NOT JSON.parse the cookie (it's a JWT)
  // Just trust it exists. Role will be checked on dashboard API calls.

  // Role-based redirection (client-side sets role into routes)
  // Just allow access here.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/hr/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/client/:path*",
    "/login/:path*",
  ],
};