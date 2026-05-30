import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess, toIso } from "../_utils";

export const runtime = "nodejs";

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof (value as Record<string, unknown>)?.toDate === "function") {
    const d = (value as Record<string, unknown>).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) return value;
  return null;
}

export async function GET() {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const [usersSnap, tasksSnap, docsSnap, attendanceSnap, eventsSnap] = await Promise.all([
      adminDb.collection("users").where("tenantId", "==", access.user.tenantId).limit(500).get(),
      adminDb.collection("onboardingTasks").where("tenantId", "==", access.user.tenantId).limit(500).get(),
      adminDb.collection("employeeDocuments").where("tenantId", "==", access.user.tenantId).limit(500).get(),
      adminDb.collection("attendance_logs").where("tenantId", "==", access.user.tenantId).limit(500).get(),
      adminDb.collection("events").where("tenantId", "==", access.user.tenantId).limit(500).get(),
    ]);

    const users = usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
    const employees = users.filter((user: unknown) => {
      const role = String((user as Record<string, unknown>)?.role || "").toLowerCase();
      return role && role !== "client";
    });

    const totalEmployees = employees.length;
    const activeEmployees = employees.filter((user: unknown) => {
      const status = String((user as Record<string, unknown>)?.status || "active").toLowerCase();
      return status !== "disabled" && status !== "inactive";
    }).length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newHires = employees.filter((user: unknown) => {
      const joined = parseDate((user as Record<string, unknown>)?.joiningDate) || parseDate((user as Record<string, unknown>)?.createdAt);
      return joined ? joined >= thirtyDaysAgo : false;
    }).length;

    const tasks = tasksSnap.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const openOnboarding = tasks.filter((task: unknown) => String((task as Record<string, unknown>)?.status || "").toLowerCase() !== "completed").length;

    const statusCounts = tasks.reduce(
      (acc: Record<string, number>, task: unknown) => {
        const status = String((task as Record<string, unknown>)?.status || "Not Started");
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { "Not Started": 0, "In Progress": 0, Completed: 0 }
    );

    const docs = docsSnap.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const documentsCount = docs.filter((doc: unknown) => (doc as Record<string, unknown>)?.isDeleted !== true).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const attendanceLogs = attendanceSnap.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const recentAttendance = attendanceLogs.filter((log: unknown) => {
      const created = parseDate((log as Record<string, unknown>)?.createdAt || (log as Record<string, unknown>)?.timestamp || (log as Record<string, unknown>)?.date);
      return created ? created >= sevenDaysAgo : false;
    });
    const attendanceUsers = new Set(recentAttendance.map((log: unknown) => String((log as Record<string, unknown>)?.userId || (log as Record<string, unknown>)?.uid || "")));

    const events = eventsSnap.docs
      .map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }))
      .filter((event: unknown) => String((event as Record<string, unknown>)?.type || "").startsWith("hr."))
      .sort((a: unknown, b: unknown) => {
        const aDate = parseDate((a as Record<string, unknown>)?.createdAt);
        const bDate = parseDate((b as Record<string, unknown>)?.createdAt);
        const aTime = aDate ? aDate.getTime() : 0;
        const bTime = bDate ? bDate.getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 20)
      .map((event: unknown) => ({
        id: (event as Record<string, unknown>).id,
        type: (event as Record<string, unknown>).type,
        title: (event as Record<string, unknown>).title || "",
        description: (event as Record<string, unknown>).description || "",
        createdAt: toIso((event as Record<string, unknown>).createdAt),
        createdByName: (event as Record<string, unknown>).createdByName || null,
        entityType: (event as Record<string, unknown>).entityType || null,
        entityId: (event as Record<string, unknown>).entityId || null,
      }));

    return NextResponse.json({
      ok: true,
      overview: {
        kpis: {
          totalEmployees,
          activeEmployees,
          newHires,
          openOnboarding,
          attendance7d: attendanceUsers.size,
          documents: documentsCount,
        },
        onboardingStatus: statusCounts,
        recentActivity: events,
      },
    });
  } catch (err) {
    console.error("HR overview error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
