import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/security";
import { invalidateSession } from "@/lib/auth/session";
import { resolveErrorResponse } from "@/lib/errors";

const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com";

export async function POST(req: Request) {
  try {
    await checkRateLimit(req, "strict");
    const sessionCookie = cookies().get(COOKIE_NAME)?.value;
    if (sessionCookie) {
      await invalidateSession(sessionCookie);
    }

    const res = NextResponse.json({ success: true });

    // Clear lac_session cookie
    res.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: COOKIE_DOMAIN,
      maxAge: 0,
    });

    return res;
  } catch (e) {
    console.error("Logout error", e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: "Unable to log out.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
