import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";
import { hashSessionToken, invalidateSessionById } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    await checkRateLimit(req, "standard", current.uid);

    const token = cookies().get("lac_session")?.value;
    const currentId = token ? hashSessionToken(token) : null;

    if (currentId && currentId === params.id) {
      throw new AppError({
        message: "You cannot invalidate the current session from this endpoint.",
        code: "CONFLICT",
        status: 409,
      });
    }

    const sessionSnap = await adminDb.collection("sessions").doc(params.id).get();
    if (!sessionSnap.exists) {
      throw new AppError({ message: "Session not found.", code: "NOT_FOUND", status: 404 });
    }
    const session = sessionSnap.data();
    if (!session || session.uid !== current.uid) {
      throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
    }

    await invalidateSessionById(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sessions delete error", error);
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to invalidate session.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
