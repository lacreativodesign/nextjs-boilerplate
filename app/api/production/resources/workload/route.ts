import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  calculateAvailableCapacity,
  detectOverAllocation,
  suggestResourceLeveling,
  type ProductionResource,
  type ResourceAssignment,
} from "@/lib/production/capacity";
import { asIsoDate, getResourcePlannerUser } from "../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function defaultRange() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 27);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { user } = auth;
    const { searchParams } = new URL(request.url);
    const range = defaultRange();
    const startDate = String(searchParams.get("startDate") || range.startDate).slice(0, 10);
    const endDate = String(searchParams.get("endDate") || range.endDate).slice(0, 10);

    const [resourceSnap, assignmentSnap] = await Promise.all([
      adminDb.collection("productionResources").where("tenantId", "==", user.tenantId).where("active", "==", true).get(),
      adminDb.collection("productionResourceAssignments").where("tenantId", "==", user.tenantId).where("status", "==", "active").get(),
    ]);

    const resources: ProductionResource[] = resourceSnap.docs.map((doc) => {
      const data = doc.data() as unknown;
      return {
        id: String((data as Record<string, unknown>).resourceId || doc.id.replace(`${user.tenantId}_`, "")),
        tenantId: user.tenantId,
        type: (data as Record<string, unknown>).type || "employee",
        name: (data as Record<string, unknown>).name || "Unnamed resource",
        capacityHoursPerDay: Number((data as Record<string, unknown>).capacityHoursPerDay || 8),
        availabilityPercent: Number((data as Record<string, unknown>).availabilityPercent ?? 100),
        hourlyRate: Number((data as Record<string, unknown>).hourlyRate || 0),
        active: Boolean((data as Record<string, unknown>).active),
      };
    });

    const assignments: ResourceAssignment[] = assignmentSnap.docs.map((doc) => {
      const data = doc.data() as unknown;
      return {
        id: doc.id,
        tenantId: user.tenantId,
        projectId: String((data as Record<string, unknown>).projectId || ""),
        projectName: String((data as Record<string, unknown>).projectName || ""),
        taskId: String((data as Record<string, unknown>).taskId || ""),
        taskName: String((data as Record<string, unknown>).taskName || ""),
        resourceId: String((data as Record<string, unknown>).resourceId || ""),
        resourceType: (data as Record<string, unknown>).resourceType || "employee",
        resourceName: String((data as Record<string, unknown>).resourceName || ""),
        allocationHoursPerDay: Number((data as Record<string, unknown>).allocationHoursPerDay || 0),
        startDate: asIsoDate((data as Record<string, unknown>).startDate) || startDate,
        endDate: asIsoDate((data as Record<string, unknown>).endDate) || endDate,
        hourlyRate: Number((data as Record<string, unknown>).hourlyRate || 0),
        status: (data as Record<string, unknown>).status || "active",
      };
    });

    const workloads = calculateAvailableCapacity(resources, assignments, startDate, endDate);
    const warnings = detectOverAllocation(workloads);
    const levelingSuggestions = suggestResourceLeveling(workloads);

    return NextResponse.json({
      ok: true,
      startDate,
      endDate,
      workloads,
      warnings,
      levelingSuggestions,
    });
  } catch (error) {
    console.error("GET /api/production/resources/workload", error);
    return NextResponse.json({ ok: false, error: "Unable to load workload." }, { status: 500 });
  }
}
