import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const snap = await adminDb.collection("employees").orderBy("createdAt", "desc").get();

    const employees: any[] = [];

    snap.forEach((doc) => {
      employees.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return NextResponse.json({
      success: true,
      employees,
    });
  } catch (err: any) {
    console.error("Error fetching employees:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Server Error" },
      { status: 500 }
    );
  }
}
