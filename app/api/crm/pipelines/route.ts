import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireCrmUser } from "@/lib/crm";

export async function GET() {
  const auth = await requireCrmUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const snapshot = await adminDb
    .collection("pipelines")
    .where("tenantId", "==", auth.tenantId)
    .where("isActive", "==", true)
    .orderBy("isDefault", "desc")
    .orderBy("name", "asc")
    .get();

  const pipelines = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ pipelines });
}
