import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  try {
    const sessionUser = await getCurrentUser();

    // AUTH CHECK
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      sessionUser.role !== "super_admin" &&
      sessionUser.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const uid = params.uid;
    const body = await req.json();

    // REQUIRED VALIDATION
    const requiredFields = ["name", "email", "role"];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // CLEAN PAYLOAD
    const payload = {
      name: body.name || "",
      email: body.email || "",
      phone: body.phone || "",
      role: (body.role || "").toLowerCase(),
      department: body.department || "",
      designation: body.designation || "",
      salary: body.salary ? Number(body.salary) : 0,
      monthlyTarget: body.monthlyTarget ? Number(body.monthlyTarget) : 0,
      commission: body.commission ? Number(body.commission) : 0,
      joiningDate: body.joiningDate || "",
      status: (body.status || "active").toLowerCase(),
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection("users").doc(uid).update(payload);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("UPDATE USER ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user." },
      { status: 500 }
    );
  }
}
