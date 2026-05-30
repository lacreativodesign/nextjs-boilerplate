import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { calculateAvailableCapacity, type ProductionResource, type ResourceAssignment } from "@/lib/production/capacity";
import { asIsoDate, getResourcePlannerUser } from "../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getWindow(period: "weekly" | "monthly") {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  if (period === "weekly") {
    start.setUTCDate(start.getUTCDate() - start.getUTCDay() + 1);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  const monthlyStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const monthlyEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { startDate: monthlyStart.toISOString().slice(0, 10), endDate: monthlyEnd.toISOString().slice(0, 10) };
}

export async function GET(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const periodParam = new URL(request.url).searchParams.get("period");
    const period = periodParam === "weekly" ? "weekly" : "monthly";
    const window = getWindow(period);

    const [resourceSnap, assignmentSnap] = await Promise.all([
      adminDb.collection("productionResources").where("tenantId", "==", auth.user.tenantId).where("active", "==", true).get(),
      adminDb.collection("productionResourceAssignments").where("tenantId", "==", auth.user.tenantId).where("status", "==", "active").get(),
    ]);

    const resources: ProductionResource[] = resourceSnap.docs.map((doc) => {
      const data = doc.data() as unknown;
      return {
        id: String((data as Record<string, unknown>).resourceId || doc.id.replace(`${auth.user.tenantId}_`, "")),
        tenantId: auth.user.tenantId,
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
        tenantId: auth.user.tenantId,
        projectId: String((data as Record<string, unknown>).projectId || ""),
        taskId: String((data as Record<string, unknown>).taskId || ""),
        resourceId: String((data as Record<string, unknown>).resourceId || ""),
        resourceType: (data as Record<string, unknown>).resourceType || "employee",
        resourceName: String((data as Record<string, unknown>).resourceName || ""),
        allocationHoursPerDay: Number((data as Record<string, unknown>).allocationHoursPerDay || 0),
        startDate: asIsoDate((data as Record<string, unknown>).startDate) || window.startDate,
        endDate: asIsoDate((data as Record<string, unknown>).endDate) || window.endDate,
        hourlyRate: Number((data as Record<string, unknown>).hourlyRate || 0),
        status: (data as Record<string, unknown>).status || "active",
      };
    });

    const workloads = calculateAvailableCapacity(resources, assignments, window.startDate, window.endDate);

    const utilizationByResource = workloads.map((workload) => ({
      resourceId: workload.resourceId,
      resourceName: workload.resourceName,
      resourceType: workload.resourceType,
      totalCapacityHours: workload.totalCapacityHours,
      totalAllocatedHours: workload.totalAllocatedHours,
      utilizationPercent: Number(workload.utilizationPercent.toFixed(2)),
      targetBand: workload.utilizationPercent >= 70 && workload.utilizationPercent <= 80 ? "on_target" : "outside_target",
      overAllocatedDays: workload.overAllocatedDays,
      projectedCost: Number(
        workload.assignments.reduce((sum, assignment) => sum + assignment.hourlyRate * assignment.allocationHoursPerDay, 0).toFixed(2)
      ),
    }));

    const aggregateCapacity = utilizationByResource.reduce((sum, row) => sum + row.totalCapacityHours, 0);
    const aggregateAllocated = utilizationByResource.reduce((sum, row) => sum + row.totalAllocatedHours, 0);

    return NextResponse.json({
      ok: true,
      period,
      startDate: window.startDate,
      endDate: window.endDate,
      summary: {
        resources: utilizationByResource.length,
        totalCapacityHours: Number(aggregateCapacity.toFixed(2)),
        totalAllocatedHours: Number(aggregateAllocated.toFixed(2)),
        utilizationPercent: aggregateCapacity > 0 ? Number(((aggregateAllocated / aggregateCapacity) * 100).toFixed(2)) : 0,
        targetBand: "70-80%",
      },
      utilizationByResource,
    });
  } catch (error) {
    console.error("GET /api/production/resources/utilization", error);
    return NextResponse.json({ ok: false, error: "Unable to load utilization report." }, { status: 500 });
  }
}
