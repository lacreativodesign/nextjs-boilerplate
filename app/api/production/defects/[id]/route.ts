import { NextResponse } from "next/server";
import { getResourcePlannerUser } from "../../resources/_utils";
import { type DefectSeverity, type DefectStatus, updateDefect } from "@/lib/production/qa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PUT(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const defectId = cleanString(context.params.id);
    if (!defectId) return NextResponse.json({ ok: false, error: "Defect id is required." }, { status: 400 });

    const body = (await request.json()) as {
      status?: DefectStatus;
      severity?: DefectSeverity;
      assignedToUid?: string | null;
      rootCauseCategory?: string | null;
      rootCauseNotes?: string | null;
      escapedToProduction?: boolean;
    };

    if (body.status && !["open", "in_progress", "resolved", "closed", "reopened"].includes(body.status)) {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }

    if (body.severity && !["critical", "high", "medium", "low"].includes(body.severity)) {
      return NextResponse.json({ ok: false, error: "Invalid severity." }, { status: 400 });
    }

    const defect = await updateDefect(
      auth.user.tenantId,
      defectId,
      { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || auth.user.uid },
      {
        status: body.status,
        severity: body.severity,
        assignedToUid: body.assignedToUid === undefined ? undefined : cleanString(body.assignedToUid) || null,
        rootCauseCategory: body.rootCauseCategory === undefined ? undefined : cleanString(body.rootCauseCategory) || null,
        rootCauseNotes: body.rootCauseNotes === undefined ? undefined : cleanString(body.rootCauseNotes) || null,
        escapedToProduction: body.escapedToProduction,
      }
    );

    return NextResponse.json({ ok: true, defect });
  } catch (error: any) {
    if (error?.message === "Defect not found") return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    if (error?.message === "Forbidden") return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    console.error("PUT /api/production/defects/[id]", error);
    return NextResponse.json({ ok: false, error: "Unable to update defect." }, { status: 500 });
  }
}
