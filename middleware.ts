import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname;

  // ✅ 1 — Allow login host completely
  if (req.headers.get("host")?.startsWith("login.")) {
    return NextResponse.next();
  }

  // ✅ 2 — Require cookie on dashboard
  const sessionCookie = req.cookies.get("lac_session")?.value;

  if (!sessionCookie) {
    return NextResponse.redirect("https://login.lacreativo.com/login");
  }

  // ✅ 3 — If cookie exists, allow dashboard pages
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/hr/:path*",
    "/production/:path*",
    "/finance/:path*",
    "/client/:path*",
    "/login/:path*",
  ],
};
