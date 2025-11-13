// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

// quick cache in memory between requests
const cache = new Map<string, string>();

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("lac_session")?.value;

  // Public access
  if (pathname.startsWith("/login") || pathname === "/") {
    // If user already signed in, push them to "/"
    if (token) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  // Require session
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Verify cookie
  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(token, true);
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const uid = decoded?.uid;
  if (!uid) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Try cached role first
  let role = cache.get(uid);
  if (!role) {
    const snap = await adminDb.collection("users").doc(uid).get();
    role = (snap.data()?.role || "").toString().toLowerCase();
    cache.set(uid, role);
  }

  const rolePaths: Record<string, string> = {
    admin: "/admin",
    sales: "/sales",
    am: "/am",
    hr: "/hr",
    finance: "/finance",
    production: "/production",
    client: "/client",
  };

  const allowedPath = rolePaths[role];
  if (!allowedPath) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 🚫 If role tries to access a different dashboard, force them back to theirs
  if (!pathname.startsWith(allowedPath)) {
    return NextResponse.redirect(new URL(allowedPath, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
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
