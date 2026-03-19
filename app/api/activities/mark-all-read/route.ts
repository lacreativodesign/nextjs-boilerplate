import { NextResponse } from "next/server";
import { getCurrentUser } from "../../admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const stateDocId = `${me.tenantId}_${me.uid}`;
  const now = new Date().toISOString();

  await adminDb.collection("activity_read_states").doc(stateDocId).set(
    {
      tenantId: me.tenantId,
      uid: me.uid,
      lastReadAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
