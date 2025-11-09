// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";

  // Always show the Login page on login.lacreativo.com
  if (host.startsWith("login.")) {
    // Allow assets/_next/static to pass through
    const pathname = req.nextUrl.pathname;

    const assetPaths = ["/_next", "/favicon.ico", "/icons", "/images", "/public"];
    if (assetPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }

    // If the user is not already on /login, rewrite there
    if (pathname !== "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.rewrite(url);
    }
  }

  // Everything else (dashboard.lacreativo.com, vercel domain, etc.) continues normally
  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"], // run on all paths
};
