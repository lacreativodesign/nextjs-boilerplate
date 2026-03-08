import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess, toIso } from "../_utils";

export const runtime = "nodejs";

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
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
      adminDb.collection("users").limit(500).get(),
      adminDb.collection("onboardingTasks").limit(500).get(),
      adminDb.collection("employeeDocuments").limit(500).get(),
      adminDb.collection("attendance_logs").limit(500).get(),
      adminDb.collection("events").limit(500).get(),
    ]);

    const users = usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
    const employees = users.filter((user: any) => {
      const role = String(user?.role || "").toLowerCase();
      return role && role !== "client";
    });

    const totalEmployees = employees.length;
    const activeEmployees = employees.filter((user: any) => {
      const status = String(user?.status || "active").toLowerCase();
      return status !== "disabled" && status !== "inactive";
    }).length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newHires = employees.filter((user: any) => {
      const joined = parseDate(user?.joiningDate) || parseDate(user?.createdAt);
      return joined ? joined >= thirtyDaysAgo : false;
    }).length;

    const tasks = tasksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const openOnboarding = tasks.filter((task: any) => String(task?.status || "").toLowerCase() !== "completed").length;

    const statusCounts = tasks.reduce(
      (acc: Record<string, number>, task: any) => {
        const status = String(task?.status || "Not Started");
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { "Not Started": 0, "In Progress": 0, Completed: 0 }
    );

    const docs = docsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const documentsCount = docs.filter((doc: any) => doc?.isDeleted !== true).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const attendanceLogs = attendanceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const recentAttendance = attendanceLogs.filter((log: any) => {
      const created = parseDate(log?.createdAt || log?.timestamp || log?.date);
      return created ? created >= sevenDaysAgo : false;
    });
    const attendanceUsers = new Set(recentAttendance.map((log: any) => String(log?.userId || log?.uid || "")));

    const events = eventsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((event: any) => String(event?.type || "").startsWith("hr."))
      .sort((a: any, b: any) => {
        const aDate = parseDate(a?.createdAt);
        const bDate = parseDate(b?.createdAt);
        const aTime = aDate ? aDate.getTime() : 0;
        const bTime = bDate ? bDate.getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 20)
      .map((event: any) => ({
        id: event.id,
        type: event.type,
        title: event.title || "",
        description: event.description || "",
        createdAt: toIso(event.createdAt),
        createdByName: event.createdByName || null,
        entityType: event.entityType || null,
        entityId: event.entityId || null,
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
