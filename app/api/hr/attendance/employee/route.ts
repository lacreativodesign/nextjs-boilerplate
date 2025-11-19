import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import dayjs from "dayjs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const month = searchParams.get("month");

    if (!userId || !month) {
      return NextResponse.json(
        { success: false, message: "Missing userId or month" },
        { status: 400 }
      );
    }

    const start = dayjs(month + "-01").startOf("month");
    const end = start.endOf("month");

    // Employee
    const empSnap = await adminDb.collection("employees").doc(userId).get();
    if (!empSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    const employee = { id: empSnap.id, ...empSnap.data() };

    // Logs
    const logsSnap = await adminDb
      .collection("attendance")
      .where("userId", "==", userId)
      .where("date", ">=", start.format("YYYY-MM-DD"))
      .where("date", "<=", end.format("YYYY-MM-DD"))
      .get();

    const logs = logsSnap.docs.map((d) => d.data());

    return NextResponse.json({
      success: true,
      employee,
      logs,
    });
  } catch (err: any) {
    console.error("Employee attendance API error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
  }
