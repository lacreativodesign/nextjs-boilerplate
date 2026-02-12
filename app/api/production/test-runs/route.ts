import { NextResponse } from "next/server";
import { getResourcePlannerUser } from "../resources/_utils";
import { executeTestRun } from "@/lib/production/qa";

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
      testCaseId?: string;
      status?: "passed" | "failed" | "blocked";
      defectsLinked?: string[];
      notes?: string;
    };

    const testCaseId = cleanString(body.testCaseId);
    if (!testCaseId || !body.status || !["passed", "failed", "blocked"].includes(body.status)) {
      return NextResponse.json({ ok: false, error: "testCaseId and valid status are required." }, { status: 400 });
    }

    const testRun = await executeTestRun(
      auth.user.tenantId,
      { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || auth.user.uid },
      {
        testCaseId,
        status: body.status,
        defectsLinked: Array.isArray(body.defectsLinked)
          ? body.defectsLinked.map((id) => cleanString(id)).filter(Boolean)
          : [],
        notes: cleanString(body.notes),
      }
    );

    return NextResponse.json({ ok: true, testRun });
  } catch (error: any) {
    if (error?.message === "Test case not found") return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    if (error?.message === "Forbidden") return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    console.error("POST /api/production/test-runs", error);
    return NextResponse.json({ ok: false, error: "Unable to execute test run." }, { status: 500 });
  }
}
