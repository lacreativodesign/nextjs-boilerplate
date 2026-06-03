import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const current = await getCurrentUser(req);
    if (!current || (!isAdminRole(current.role) && current.role !== "super_admin")) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    await checkRateLimit(req, "relaxed", current.uid);

    const snap = await adminDb
      .collection("users")
      .where("tenantId", "==", current.tenantId)
      .get();

    const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    const identifiers = list.map((u) => ({ uid: u.uid })).filter((item) => Boolean(item.uid));
    const mfaMap = new Map<string, boolean>();

    if (identifiers.length) {
      const authResult = await adminAuth.getUsers(identifiers);
      authResult.users.forEach((u) => {
        mfaMap.set(u.uid, (u.multiFactor?.enrolledFactors || []).length > 0);
      });
    }

    const users = list.map((u) => ({ ...u, mfaEnabled: mfaMap.get(u.uid) || false }));

    return NextResponse.json({ users });
  } catch (e) {
    console.error("Error list-users:", e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: "Unable to list users.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
