import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canCreateLeads, isAdminReadOnly, requireCrmUser, toIso } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const role = auth.user.role;
  const query = adminDb.collection("leads").where("tenantId", "==", auth.tenantId).orderBy("createdAt", "desc").limit(500);
  const snap = await query.get();

  const leads = snap.docs
    .filter((doc) => {
      if (role === "sales") {
        return doc.data().createdBy === auth.user.uid;
      }
      return true;
    })
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name || ""),
        email: String(data.email || ""),
        phone: String(data.phone || ""),
        company: String(data.company || ""),
        source: String(data.source || ""),
        status: String(data.status || "new"),
        createdBy: String(data.createdBy || ""),
        createdAt: toIso(data.createdAt),
      };
    });

  return NextResponse.json({ ok: true, leads, readOnly: isAdminReadOnly(role), canCreate: canCreateLeads(role) });
}

export async function POST(req: Request) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canCreateLeads(auth.user.role)) {
    return NextResponse.json({ ok: false, error: "Only sales can create leads." }, { status: 403 });
  }

  const payload = await req.json();
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  const phone = String(payload.phone || "").trim();
  const company = String(payload.company || "").trim();
  const source = String(payload.source || "").trim();

  if (!name || !email || !company) {
    return NextResponse.json({ ok: false, error: "Name, email, and company are required." }, { status: 400 });
  }

  const ref = adminDb.collection("leads").doc();
  await ref.set({
    id: ref.id,
    name,
    email,
    phone,
    company,
    source,
    status: "new",
    createdBy: auth.user.uid,
    tenantId: auth.tenantId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, id: ref.id });
}
