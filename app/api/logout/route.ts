import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/security";
import { invalidateSession } from "@/lib/auth/session";
import { resolveErrorResponse } from "@/lib/errors";

const COOKIE_NAME = "lac_session";
function getCookieDomain(hostname: string): string | undefined {
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  const parts = hostname.split(".");
  if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
  return undefined;
}

export async function POST(request: Request) {
  try {
    await checkRateLimit(request, "strict");
    const sessionCookie = cookies().get(COOKIE_NAME)?.value;
    if (sessionCookie) {
      await invalidateSession(sessionCookie);
    }

    const res = NextResponse.json({ success: true });
    const hostname = new URL(request.url).hostname;
    const cookieDomain = getCookieDomain(hostname);

    // Clear lac_session cookie
    res.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: cookieDomain,
      maxAge: 0,
    });

    return res;
  } catch (e) {
    console.error("Logout error", e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: "Unable to log out.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: request.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
