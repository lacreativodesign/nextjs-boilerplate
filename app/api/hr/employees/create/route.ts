import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess } from "../../_utils";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json(
        { success: false, message: access.error },
        { status: access.status }
      );
    }

    const body = await req.json();

    const { name, email, role, department, status } = body;

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
      tenantId: access.user.tenantId,
      createdAt: new Date().toISOString(),
    };

    // Firestore Path: employees/{autoID}
    const docRef = await adminDb.collection("employees").add(newEmployee);

    const employeeNotifyTargets = await getUsersByRoles(["admin", "super_admin", "hr"], access.user.tenantId);
    await createNotifications({
      recipients: employeeNotifyTargets,
      tenantId: access.user.tenantId,
      type: "info",
      title: "New employee added",
      message: `${name} was added to ${department}.`,
      entityType: "hr",
      entityId: docRef.id,
      deepLink: "/admin/hr/employees",
    });

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message: "Employee created successfully",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error creating employee:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Server error" },
      { status: 500 }
    );
  }
}
