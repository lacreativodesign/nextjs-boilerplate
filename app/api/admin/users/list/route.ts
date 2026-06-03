import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../_utils";
import { paginationSchema } from "@/lib/validations/common";
import { validateQuery } from "@/lib/validations/validate";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current || (!isAdminRole(current.role) && current.role !== 'super_admin')) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    await checkRateLimit(req, "relaxed", current.uid);

    void validateQuery(paginationSchema, req.nextUrl.searchParams);

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 500);
    const cursor = req.nextUrl.searchParams.get("cursor");

    let query: FirebaseFirestore.Query = adminDb
      .collection("users")
      .where("tenantId", "==", current.tenantId)
      .orderBy("createdAt", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await adminDb.collection("users").doc(cursor).get();
      if (cursorDoc.exists && cursorDoc.data()?.tenantId === current.tenantId) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > limit;
    const pageDocs = snap.docs.slice(0, limit);

    const list = pageDocs.map((d) => ({
      uid: d.id,
      ...d.data(),
    }));

    const identifiers = list.map((user) => ({ uid: user.uid })).filter((item) => Boolean(item.uid));
    const mfaMap = new Map<string, boolean>();

    if (identifiers.length) {
      const authResult = await adminAuth.getUsers(identifiers);
      authResult.users.forEach((user) => {
        const enrolled = user.multiFactor?.enrolledFactors || [];
        mfaMap.set(user.uid, enrolled.length > 0);
      });
    }

    const enriched = list.map((user) => ({
      ...user,
      mfaEnabled: mfaMap.get(user.uid) || false,
    }));

    return NextResponse.json({
      users: enriched,
      pagination: {
        hasMore,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
      },
    });
  } catch (e) {
    console.error("Error list users:", e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: "Unable to list users.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
