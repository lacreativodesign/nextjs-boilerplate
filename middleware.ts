import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login pages always
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("lac_session")?.value;

  // No cookie → send to login.lacreativo.com/login
  if (!cookie) {
    return NextResponse.redirect("https://login.lacreativo.com/login");
  }

  // Cookie exists → DO NOTHING. Let the dashboard pages handle roles.
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
