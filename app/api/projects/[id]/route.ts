import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canReadProject, mapProject, requireProjectUser, resolveClientIdFromUser } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const user = { ...auth.user } as any;
  if (user.role === "client") user.clientId = await resolveClientIdFromUser(user);

  const ref = adminDb.collection("projects").doc(params.id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const project = mapProject(snap.id, snap.data() || {});
  if (!canReadProject(project, user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const [filesSnap, messagesSnap, crSnap] = await Promise.all([
    adminDb.collection("projectFiles").where("projectId", "==", params.id).orderBy("uploadedAt", "desc").limit(100).get().catch(() => null),
    adminDb.collection("projectMessages").where("projectId", "==", params.id).orderBy("createdAt", "asc").limit(200).get().catch(() => null),
    adminDb.collection("changeRequests").where("projectId", "==", params.id).orderBy("requestedAt", "desc").limit(50).get().catch(() => null),
  ]);

  return NextResponse.json({
    ok: true,
    project,
    files: (filesSnap?.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) })),
    messages: (messagesSnap?.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) })),
    changeRequests: (crSnap?.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) })),
  });
}
