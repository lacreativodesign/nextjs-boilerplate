import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

type Params = { params: { uid: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const access = await requireAdminOrSuperAdmin();
    if (!access.ok) {
      throw new AppError({
        message: access.error,
        code: access.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        status: access.status,
      });
    }

    await checkRateLimit(req, "standard", access.user.uid);

    const userDoc = await adminDb.collection("users").doc(params.uid).get();
    const userData = userDoc.data();
    if (!userDoc.exists || userData?.tenantId !== access.user.tenantId) {
      throw new AppError({ message: "User not found", code: "NOT_FOUND", status: 404 });
    }

    const user = await adminAuth.getUser(params.uid);
    const enrolledFactors = user.multiFactor?.enrolledFactors || [];

    return NextResponse.json({
      ok: true,
      mfaEnabled: enrolledFactors.length > 0,
      enrolledFactors: enrolledFactors.length,
      lastUpdatedAt: user.tokensValidAfterTime || null,
    });
  } catch (error) {
    console.error("admin mfa status error", error);
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to load MFA status.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const access = await requireAdminOrSuperAdmin();
    if (!access.ok) {
      throw new AppError({
        message: access.error,
        code: access.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        status: access.status,
      });
    }

    await checkRateLimit(req, "standard", access.user.uid);

    const userDoc = await adminDb.collection("users").doc(params.uid).get();
    const userData = userDoc.data();
    if (!userDoc.exists || userData?.tenantId !== access.user.tenantId) {
      throw new AppError({ message: "User not found", code: "NOT_FOUND", status: 404 });
    }

    await adminAuth.updateUser(params.uid, {
      multiFactor: {
        enrolledFactors: [],
      },
    });

    await adminDb.collection("users").doc(params.uid).set(
      {
        mfaEnabled: false,
        mfaUpdatedAt: new Date().toISOString(),
        tenantId: access.user.tenantId,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin mfa reset error", error);
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to reset MFA.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
