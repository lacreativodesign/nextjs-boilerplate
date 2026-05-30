import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getResourcePlannerUser } from "../_utils";
import type { ResourceType } from "@/lib/production/capacity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AssignPayload = {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  taskId: string;
  projectId: string;
  allocationHoursPerDay: number;
  startDate: string;
  endDate: string;
  hourlyRate?: number;
  capacityHoursPerDay?: number;
  availabilityPercent?: number;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return "";
  return value.slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const auth = await getResourcePlannerUser();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const me = auth.user;
    const body = (await request.json()) as AssignPayload;

    const resourceId = cleanString(body.resourceId);
    const resourceName = cleanString(body.resourceName);
    const taskId = cleanString(body.taskId);
    const projectId = cleanString(body.projectId);
    const startDate = normalizeDate(body.startDate);
    const endDate = normalizeDate(body.endDate);
    const allocationHoursPerDay = Number(body.allocationHoursPerDay || 0);

    if (!resourceId || !resourceName || !taskId || !projectId || !startDate || !endDate) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    if (!["employee", "equipment", "material"].includes(body.resourceType)) {
      return NextResponse.json({ ok: false, error: "Invalid resource type." }, { status: 400 });
    }

    if (!Number.isFinite(allocationHoursPerDay) || allocationHoursPerDay <= 0) {
      return NextResponse.json({ ok: false, error: "Allocation hours must be greater than zero." }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ ok: false, error: "startDate must be before endDate." }, { status: 400 });
    }

    const [taskDoc, projectDoc] = await Promise.all([
      adminDb.collection("tasks").doc(taskId).get(),
      adminDb.collection("projects").doc(projectId).get(),
    ]);

    if (!taskDoc.exists) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    if (!projectDoc.exists) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

    const taskData = taskDoc.data() as unknown;
    const projectData = projectDoc.data() as unknown;

    if ((taskData as Record<string, unknown>).tenantId !== me.tenantId || (projectData as Record<string, unknown>).tenantId !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const hourlyRate = Number(body.hourlyRate ?? 0);
    const capacityHoursPerDay = Number(body.capacityHoursPerDay ?? 8);
    const availabilityPercent = Number(body.availabilityPercent ?? 100);

    const resourceRef = adminDb.collection("productionResources").doc(`${me.tenantId}_${resourceId}`);
    const assignmentRef = adminDb.collection("productionResourceAssignments").doc();

    await adminDb.runTransaction(async (tx) => {
      tx.set(
        resourceRef,
        {
          tenantId: me.tenantId,
          type: body.resourceType,
          name: resourceName,
          capacityHoursPerDay: Number.isFinite(capacityHoursPerDay) ? capacityHoursPerDay : 8,
          availabilityPercent: Number.isFinite(availabilityPercent) ? availabilityPercent : 100,
          hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
          active: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: me.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(assignmentRef, {
        tenantId: me.tenantId,
        projectId,
        projectName: (projectData as Record<string, unknown>).name || "",
        taskId,
        taskName: (taskData as Record<string, unknown>).title || "",
        resourceId,
        resourceType: body.resourceType,
        resourceName,
        allocationHoursPerDay,
        startDate,
        endDate,
        hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
        estimatedCost:
          Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1)) *
          allocationHoursPerDay *
          (Number.isFinite(hourlyRate) ? hourlyRate : 0),
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: me.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: me.uid,
      });
    });

    return NextResponse.json({ ok: true, assignmentId: assignmentRef.id });
  } catch (error) {
    console.error("POST /api/production/resources/assign", error);
    return NextResponse.json({ ok: false, error: "Unable to assign resource." }, { status: 500 });
  }
}
