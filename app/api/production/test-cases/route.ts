import { NextResponse } from "next/server";
import { getResourcePlannerUser } from "../resources/_utils";
import { createTestCase, listTestCases } from "@/lib/production/qa";

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
      requirementId?: string;
      description?: string;
      steps?: string[];
      expectedResult?: string;
    };

    const title = cleanString(body.title);
    const requirementId = cleanString(body.requirementId);
    const description = cleanString(body.description);
    const expectedResult = cleanString(body.expectedResult);
    const steps = Array.isArray(body.steps) ? body.steps.map((step) => cleanString(step)).filter(Boolean) : [];

    if (!title || !requirementId || !expectedResult || steps.length === 0) {
      return NextResponse.json(
        { ok: false, error: "title, requirementId, expectedResult and at least one step are required." },
        { status: 400 }
      );
    }

    const testCase = await createTestCase(
      auth.user.tenantId as string,
      { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || auth.user.displayName || auth.user.uid },
      {
        title,
        requirementId,
        description,
        steps,
        expectedResult,
      }
    );

    return NextResponse.json({ ok: true, testCase });
  } catch (error) {
    console.error("POST /api/production/test-cases", error);
    return NextResponse.json({ ok: false, error: "Unable to create test case." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const testCases = await listTestCases(auth.user.tenantId as string);
    return NextResponse.json({ ok: true, testCases });
  } catch (error) {
    console.error("GET /api/production/test-cases", error);
    return NextResponse.json({ ok: false, error: "Unable to load test cases." }, { status: 500 });
  }
}
