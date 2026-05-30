export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";
import dayjs from "dayjs";

export async function GET(request: Request) {
  try {
    const me = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json(
        { success: false, message: "Missing month" },
        { status: 400 }
      );
    }

    const start = dayjs(month + "-01").startOf("month");
    const end = start.endOf("month");

    // Get all employees
    const empSnap = await adminDb.collection("employees").get();
    const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Get logs for whole month
    const logsSnap = await adminDb
      .collection("attendance")
      .where("tenantId", "==", me.tenantId)
      .where("date", ">=", start.format("YYYY-MM-DD"))
      .where("date", "<=", end.format("YYYY-MM-DD"))
      .get();

    const logs = logsSnap.docs.map((d) => d.data());

    const rows = employees.map((emp: unknown) => {
      const hourlyRate = (emp as Record<string, unknown>).hourlyRate || 5; // DEFAULT HOURLY RATE

      const empLogs = logs.filter((l) => l.userId === (emp as Record<string, unknown>).id);

      let totalMs = 0;

      // compute hours like in attendance detail
      for (let i = 0; i < empLogs.length; i++) {
        if (empLogs[i].type === "login") {
          const logoutEvent = empLogs.find(
            (l: unknown) =>
              (l as Record<string, unknown>).type === "logout" &&
              new Date((l as Record<string, unknown>).timestamp) > new Date(empLogs[i].timestamp)
          );

          if (logoutEvent) {
            totalMs +=
              new Date(logoutEvent.timestamp).getTime() -
              new Date(empLogs[i].timestamp).getTime();
          }
        }
      }

      const hours = totalMs / (1000 * 60 * 60);
      const salary = +(hours * hourlyRate).toFixed(2);

      return {
        id: (emp as Record<string, unknown>).id,
        name: (emp as Record<string, unknown>).name,
        email: (emp as Record<string, unknown>).email || "",
        role: (emp as Record<string, unknown>).role || "",
        hourlyRate,
        hours: +hours.toFixed(1),
        salary,
      };
    });

    return NextResponse.json({
      success: true,
      rows,
    });
  } catch (err) {
    console.error("Payroll API error:", err);
    return NextResponse.json(
      { success: false, message: (err as Record<string, unknown>).message },
      { status: 500 }
    );
  }
      }
