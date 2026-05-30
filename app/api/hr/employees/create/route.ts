import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { name, email, role, department, status, tenantId } = body;

    if (!name || !email || !role || !department) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const newEmployee = {
      name,
      email,
      role,
      department,
      status: status || "Active",
      tenantId: String(tenantId || "").trim(),
      createdAt: new Date().toISOString(),
    };

    // Firestore Path: employees/{autoID}
    const docRef = await adminDb.collection("employees").add(newEmployee);

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message: "Employee created successfully",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error creating employee:", err);
    return NextResponse.json(
      { success: false, message: (err as Record<string, unknown>).message || "Server error" },
      { status: 500 }
    );
  }
          }
