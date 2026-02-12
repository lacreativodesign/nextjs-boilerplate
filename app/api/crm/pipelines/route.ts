import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireCrmUser } from "@/lib/crm";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";

export async function GET() {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({ message: auth.error, code: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", status: auth.status });
    }

    const snapshot = await adminDb
      .collection("pipelines")
      .where("tenantId", "==", auth.tenantId)
      .where("isActive", "==", true)
      .orderBy("isDefault", "desc")
      .orderBy("name", "asc")
      .get();

    const pipelines = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ pipelines });
  } catch (error) {
    logError(error, { route: "GET /api/crm/pipelines" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to load pipelines.",
      context: { module: "crm", operation: "list-pipelines" },
    });
    return NextResponse.json(body, { status, headers });
  }
}
