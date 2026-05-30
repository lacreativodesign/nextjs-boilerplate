import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess } from "../../_utils";

export async function GET() {
  const access = await requireHrAccess();
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

  try {
    const usersSnap = await adminDb.collection("users").where("tenantId", "==", access.user.tenantId).get();
    const attendanceSnap = await adminDb.collection("attendance").where("tenantId", "==", access.user.tenantId).get();

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Convert attendance data into quick lookup map
    const attendanceMap: Record<string, unknown[]> = {};
    attendanceSnap.forEach((doc) => {
      attendanceMap[doc.id] = doc.data().logs || [];
    });

    const absentees: unknown[] = [];

    usersSnap.forEach((userDoc) => {
      const user = userDoc.data();
      const logs = attendanceMap[userDoc.id] || [];

      const loggedToday = logs.some(
        (log) => new Date((log as Record<string, unknown>).timestamp) >= todayStart
      );

      if (!loggedToday) {
        const lastLog = logs.length ? logs[0].timestamp : null;

        absentees.push({
          userId: userDoc.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLogin: lastLog,
        });
      }
    });

    return NextResponse.json({
      success: true,
      absentees,
    });
  } catch (e) {
    console.error("Absentees error:", e);
    return NextResponse.json(
      { success: false, error: "Failed to load absentees." },
      { status: 500 }
    );
  }
          }
