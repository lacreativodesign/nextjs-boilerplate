import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAppCookies } from "./lib/getAppCookies"; // your cookie reader

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public route: login
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // Read user session
  const cookie = req.cookies.get("lc_session")?.value;

  if (!cookie) {
    // Not logged in → redirect to login
    return NextResponse.redirect(new URL("https://login.lacreativo.com", req.url));
  }

  // Cookie exists → parse it
  const session = JSON.parse(cookie);
  const role = session.role;

  // Role-based routing
  const roleToPath = {
    admin: "/admin",
    sales: "/sales",
    am: "/am",
    hr: "/hr",
    production: "/production",
    client: "/client",
    finance: "/finance",
  };

  const expectedPath = roleToPath[role];

  // If user hits wrong dashboard, redirect to the correct one
  if (!pathname.startsWith(expectedPath)) {
    return NextResponse.redirect(new URL(expectedPath, req.url));
  }

  // Allow
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
