import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Public route
  if (path.startsWith("/login")) return NextResponse.next();

  // Check session cookie
  const cookie = req.cookies.get("lac_session")?.value;

  if (!cookie) {
    return NextResponse.redirect("https://dashboard.lacreativo.com/login");
  }

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
