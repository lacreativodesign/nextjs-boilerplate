import { NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";
import { authGuard } from "@/lib/serverAuth";

export async function GET() {
  try {
    const session = await authGuard();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const db = getAdminDB();
    const usersSnap = await db.collection("users").get();

    const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
