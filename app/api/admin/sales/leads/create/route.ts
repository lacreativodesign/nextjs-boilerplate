import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { createSalesEvent, parseString, requireAdmin, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const name = parseString(payload.name, "");
    const email = parseString(payload.email, "");
    const phone = parseString(payload.phone, "");
    const source = parseString(payload.source, "");
    const stage = parseString(payload.stage, "New");
    const ownerId = parseString(payload.ownerId, "") || null;
    const ownerName = parseString(payload.ownerName, "") || null;

    const docRef = await adminDb.collection("leads").add({
      name,
      email,
      phone,
      source,
      stage,
      ownerId,
      ownerName,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createSalesEvent({
      type: "lead_created",
      title: "Lead created",
      description: `${name || "Lead"} created`,
      entityType: "lead",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
    });

    const tenantId = String(auth.user.tenantId || "");
    const recipients = await getUsersByRoles(["sales_manager", "admin", "super_admin"], tenantId || null);
    await createNotifications({
      recipients,
      tenantId: tenantId || null,
      type: "new_lead",
      title: "New lead created",
      message: `${name || "Lead"} was created.`,
      entityType: "lead",
      entityId: docRef.id,
      deepLink: "/admin/sales/leads",
      createdBy: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || "" },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("sales leads create error:", err);
    return NextResponse.json({ ok: false, error: "Unable to create lead." }, { status: 500 });
  }
}
