import { NextResponse } from "next/server";
import { getResourcePlannerUser } from "../resources/_utils";
import {
  createDefect,
  type DefectSeverity,
  type DefectStatus,
  type DefectType,
  getQaSnapshot,
} from "@/lib/production/qa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json()) as {
      title?: string;
      description?: string;
      type?: DefectType;
      severity?: DefectSeverity;
      assignedToUid?: string | null;
      requirementId?: string | null;
      escapedToProduction?: boolean;
      testCaseIds?: string[];
    };

    const title = cleanString(body.title);
    const description = cleanString(body.description);
    const requirementId = cleanString(body.requirementId);

    if (!title || !description) {
      return NextResponse.json({ ok: false, error: "title and description are required." }, { status: 400 });
    }

    if (!body.type || !["bug", "enhancement", "task"].includes(body.type)) {
      return NextResponse.json({ ok: false, error: "Invalid defect type." }, { status: 400 });
    }

    if (!body.severity || !["critical", "high", "medium", "low"].includes(body.severity)) {
      return NextResponse.json({ ok: false, error: "Invalid severity." }, { status: 400 });
    }

    const created = await createDefect(
      auth.user.tenantId as string,
      { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || auth.user.uid },
      {
        title,
        description,
        type: body.type,
        severity: body.severity,
        assignedToUid: cleanString(body.assignedToUid) || null,
        requirementId: requirementId || null,
        escapedToProduction: Boolean(body.escapedToProduction),
        testCaseIds: Array.isArray(body.testCaseIds) ? body.testCaseIds.map((id) => cleanString(id)).filter(Boolean) : [],
      }
    );

    return NextResponse.json({ ok: true, defect: created });
  } catch (error) {
    console.error("POST /api/production/defects", error);
    return NextResponse.json({ ok: false, error: "Unable to create defect." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const severity = cleanString(searchParams.get("severity"));
    const status = cleanString(searchParams.get("status"));

    const filters: { severity?: DefectSeverity; status?: DefectStatus } = {};
    if (["critical", "high", "medium", "low"].includes(severity)) filters.severity = severity as DefectSeverity;
    if (["open", "in_progress", "resolved", "closed", "reopened"].includes(status)) filters.status = status as DefectStatus;

    const snapshot = await getQaSnapshot(auth.user.tenantId as string, filters);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    console.error("GET /api/production/defects", error);
    return NextResponse.json({ ok: false, error: "Unable to load defects." }, { status: 500 });
  }
}
