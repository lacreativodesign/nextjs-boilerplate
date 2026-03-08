import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    const doc = await adminDb.collection("projects").doc(params.id).get();
    if (!doc.exists) {
      throw new AppError({ message: "Project not found", code: "NOT_FOUND", status: 404 });
    }

    const data = doc.data() as Record<string, unknown>;
    if (data.tenantId !== me.tenantId) {
      throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
    }

    return NextResponse.json({ project: { id: doc.id, ...data } });
  } catch (error) {
    logError(error, { route: "GET /api/projects/[id]" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to load project.",
      context: { module: "projects", operation: "get-project" },
    });
    return NextResponse.json(body, { status, headers });
  }
}
