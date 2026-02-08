import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../_utils";
import { paginationSchema } from "@/lib/validations/common";
import { validateQuery } from "@/lib/validations/validate";
import { resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await checkRateLimit(req, "relaxed", current.uid);

    void validateQuery(paginationSchema, req.nextUrl.searchParams);

    const snap = await adminDb.collection("users").get();

    const list = snap.docs.map((d) => ({
      uid: d.id,
      ...d.data(),
    }));

    return NextResponse.json(list);
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
