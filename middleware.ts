import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/admin","/sales","/am","/hr","/finance","/production","/client"];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get("host") || "";
  const path = url.pathname;
  const hasSession = Boolean(req.cookies.get("lac_session")?.value);

  const onLoginHost = host.startsWith("login.");
  const onDashboardHost = host.startsWith("dashboard.");

  // 1) Never show a login page on the dashboard host
  if (onDashboardHost && path.startsWith("/login")) {
    return NextResponse.redirect(new URL("https://login.lacreativo.com/login"));
  }

  // 2) Protect dashboard routes → require cookie
  if (PROTECTED.some(p => path.startsWith(p))) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("https://login.lacreativo.com/login"));
    }
  }

  // 3) If user hits /login on login host but already has a session, just send them to dashboard home
  if (onLoginHost && path.startsWith("/login") && hasSession) {
    return NextResponse.redirect(new URL("https://dashboard.lacreativo.com/admin"));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login/:path*",
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/hr/:path*",
    "/finance/:path*",
    "/production/:path*",
    "/client/:path*",
  ],
};
