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

    const employeesSnap = await adminDb.collection("employees").get();
    const employees = employeesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const attendanceSnap = await adminDb
      .collection("attendance")
      .where("tenantId", "==", me.tenantId)
      .where("date", ">=", start.format("YYYY-MM-DD"))
      .where("date", "<=", end.format("YYYY-MM-DD"))
      .get();

    const attendance = attendanceSnap.docs.map((d) => d.data());

    return NextResponse.json({
      success: true,
      employees,
      attendance,
    });
  } catch (err: any) {
    console.error("Attendance load error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
             }
