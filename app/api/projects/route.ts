import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireProjectUser, resolveClientIdFromUser, mapProject } from "./_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireProjectUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const user = { ...auth.user } as any;
  if (user.role === "client") {
    user.clientId = await resolveClientIdFromUser(user);
  }

  let query: FirebaseFirestore.Query = adminDb.collection("projects").where("isDeleted", "==", false);

  if (user.role === "am") query = query.where("assignedAM", "==", user.uid);
  if (user.role === "production") query = query.where("assignedProduction", "==", user.uid);
  if (user.role === "client") query = query.where("clientId", "==", user.clientId || "__none__");

  const snap = await query.limit(200).get();
  const projects = snap.docs.map((doc) => mapProject(doc.id, doc.data() || {}));
  return NextResponse.json({ ok: true, projects });
}
