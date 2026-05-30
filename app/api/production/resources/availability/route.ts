import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { calculateResourceWorkload, type ProductionResource, type ResourceAssignment } from "@/lib/production/capacity";
import { asIsoDate, getResourcePlannerUser } from "../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const resourceId = String(searchParams.get("resourceId") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").slice(0, 10);
    const endDate = String(searchParams.get("endDate") || "").slice(0, 10);
    const requestedHoursPerDay = Number(searchParams.get("hoursPerDay") || 0);

    if (!resourceId || !startDate || !endDate || !Number.isFinite(requestedHoursPerDay) || requestedHoursPerDay <= 0) {
      return NextResponse.json({ ok: false, error: "resourceId, startDate, endDate, and hoursPerDay are required." }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ ok: false, error: "startDate must be before endDate." }, { status: 400 });
    }

    const resourceDoc = await adminDb.collection("productionResources").doc(`${auth.user.tenantId}_${resourceId}`).get();
    if (!resourceDoc.exists) return NextResponse.json({ ok: false, error: "Resource not found." }, { status: 404 });

    const resourceData = resourceDoc.data() as unknown;
    const resource: ProductionResource = {
      id: resourceId,
      tenantId: String(auth.user.tenantId || ""),
      type: String((resourceData as Record<string, unknown>).type || "employee") as ProductionResource["type"],
      name: String((resourceData as Record<string, unknown>).name || "Unnamed resource"),
      capacityHoursPerDay: Number((resourceData as Record<string, unknown>).capacityHoursPerDay || 8),
      availabilityPercent: Number((resourceData as Record<string, unknown>).availabilityPercent ?? 100),
      hourlyRate: Number((resourceData as Record<string, unknown>).hourlyRate || 0),
      active: Boolean((resourceData as Record<string, unknown>).active),
    };

    const assignmentSnap = await adminDb
      .collection("productionResourceAssignments")
      .where("tenantId", "==", auth.user.tenantId)
      .where("resourceId", "==", resourceId)
      .where("status", "==", "active")
      .get();

    const assignments: ResourceAssignment[] = assignmentSnap.docs.map((doc) => {
      const data = doc.data() as unknown;
      return {
        id: doc.id,
        tenantId: String(auth.user.tenantId || ""),
        projectId: String((data as Record<string, unknown>).projectId || ""),
        taskId: String((data as Record<string, unknown>).taskId || ""),
        resourceId,
        resourceType: String((data as Record<string, unknown>).resourceType || "employee") as ResourceAssignment["resourceType"],
        resourceName: String((data as Record<string, unknown>).resourceName || resource.name),
        allocationHoursPerDay: Number((data as Record<string, unknown>).allocationHoursPerDay || 0),
        startDate: asIsoDate((data as Record<string, unknown>).startDate) || startDate,
        endDate: asIsoDate((data as Record<string, unknown>).endDate) || endDate,
        hourlyRate: Number((data as Record<string, unknown>).hourlyRate || 0),
        status: String((data as Record<string, unknown>).status || "active") as ResourceAssignment["status"],
      };
    });

    const workload = calculateResourceWorkload(resource, assignments, startDate, endDate);
    const conflicts = workload.days
      .filter((day) => day.availableHours < requestedHoursPerDay)
      .map((day) => ({
        date: day.date,
        capacityHours: day.capacityHours,
        allocatedHours: day.allocatedHours,
        availableHours: day.availableHours,
        requestedHours: requestedHoursPerDay,
      }));

    return NextResponse.json({
      ok: true,
      resourceId,
      startDate,
      endDate,
      requestedHoursPerDay,
      canAssign: conflicts.length === 0,
      workload,
      conflicts,
    });
  } catch (error) {
    console.error("GET /api/production/resources/availability", error);
    return NextResponse.json({ ok: false, error: "Unable to check availability." }, { status: 500 });
  }
}
