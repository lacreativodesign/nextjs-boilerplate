import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";
import { getActiveSessions, hashSessionToken, refreshSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    await checkRateLimit(req, "standard", current.uid);

    const sessions = await getActiveSessions(current.uid);
    const token = cookies().get("lac_session")?.value;
    const currentId = token ? hashSessionToken(token) : null;

    return NextResponse.json({
      ok: true,
      sessions: sessions.map((session) => ({
        ...session,
        current: currentId === session.id,
      })),
    });
  } catch (error) {
    console.error("sessions list error", error);
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to load sessions.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    await checkRateLimit(req, "standard", current.uid);

    const token = cookies().get("lac_session")?.value;
    if (!token) {
      throw new AppError({ message: "Session missing", code: "UNAUTHORIZED", status: 401 });
    }

    await refreshSession(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sessions refresh error", error);
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to refresh session.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
