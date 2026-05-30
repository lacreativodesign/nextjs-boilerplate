import { NextResponse } from "next/server";
import { adminDB } from "@/lib/firebaseAdmin";
import { requireHrAccess } from "../../_utils";

export async function GET() {
  const access = await requireHrAccess();
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

  try {
    const usersSnapshot = await adminDB.collection("users").where("tenantId", "==", access.user.tenantId).get();

    const finalAttendance: unknown[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const logsRef = adminDB.collection(`attendance/${userId}/logs`);
      const logsSnapshot = await logsRef.orderBy("timestamp", "desc").get();

      const logs = logsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      finalAttendance.push({
        userId,
        name: userData.name || "",
        email: userData.email || "",
        role: userData.role || "",
        logs,
      });
    }

    return NextResponse.json({ success: true, attendance: finalAttendance });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return NextResponse.json(
      { success: false, error: "Unable to fetch attendance" },
      { status: 500 }
    );
  }
}
