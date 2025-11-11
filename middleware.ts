// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "lac_session";
const ROLE_COOKIE = "lac_role";
const LOGIN_URL = "https://login.lacreativo.com/login";

const rolePaths: Record<string, string> = {
  admin: "/admin",
  sales: "/sales",
  am: "/am",
  client: "/client",
  hr: "/hr",
  finance: "/finance",
  production: "/production",
};

export function middleware(req: NextRequest) {
  const { pathname, hostname } = req.nextUrl;

  // Login domain → never block anything
  if (hostname === "login.lacreativo.com") {
    return NextResponse.next();
  }

  // Protect dashboard.lacreativo.com
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    return NextResponse.redirect(LOGIN_URL);
  }

  const role = (req.cookies.get(ROLE_COOKIE)?.value || "").toLowerCase();
  const allowedPath = rolePaths[role];

  if (!allowedPath) {
    return NextResponse.redirect(LOGIN_URL);
  }

  // If user is not in their correct dashboard path → redirect them
  if (!pathname.startsWith(allowedPath)) {
    return NextResponse.redirect(`https://dashboard.lacreativo.com${allowedPath}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/sales/:path*",
    "/am/:path*",
    "/client/:path*",
    "/production/:path*",
    "/finance/:path*",
    "/hr/:path*",
  ],
};