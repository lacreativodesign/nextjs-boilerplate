import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  try {
    // GET TOKEN FROM COOKIES
    const token = (await req.headers.get("cookie"))
      ?.split("; ")
      ?.find((c) => c.startsWith("session="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // VERIFY TOKEN
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch (err) {
      console.error("Invalid token:", err);
      return NextResponse.json(
        { error: "Invalid session token" },
        { status: 401 }
      );
    }

    // LOAD SESSION USER FROM FIRESTORE
    const sessionUserSnap = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!sessionUserSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const sessionUser = sessionUserSnap.data();

    // PERMISSION CHECK
    if (
      sessionUser.role !== "super_admin" &&
      sessionUser.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // TARGET USER ID
    const uid = params.uid;
    const body = await req.json();

    // REQUIRED FIELDS
    const requiredFields = ["name", "email", "role"];
    for (const f of requiredFields) {
      if (!body[f]) {
        return NextResponse.json(
          { error: `Missing field: ${f}` },
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

    // UPDATE FIRESTORE
    await adminDb.collection("users").doc(uid).update(payload);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("UPDATE ROUTE ERROR:", err);
    return NextResponse.json(
      { error: "Failed to update user." },
      { status: 500 }
    );
  }
}
