import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";
import { getClientIp } from "@/lib/security";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

function canDeleteClient(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin" || r === "admin";
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canDeleteClient(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = String((body as Record<string, unknown>)?.id || (body as Record<string, unknown>)?.clientId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Client id is required" }, { status: 400 });

  const ref = db.collection("clients").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

  const data = snap.data() || {};
  const d = data as Record<string, unknown>;
  if (d.deletedAt) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

  const now = admin.firestore.FieldValue.serverTimestamp();

  await ref.set(
    {
      deletedAt: now,
      deletedBy: me.uid,
      updatedAt: now,
    },
    { merge: true }
  );

  try {
    await logEvent({
      tenantId: String(d.tenantId || ""),
      type: "client.deleted",
      title: "Client deleted",
      description: `${String(d.companyName || "Client")} deleted.`,
      entityType: "client",
      entityId: id,
      actor: { uid: me.uid, name: String(me.name || me.fullName || "") },
      metadata: {
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent") || "",
      },
      audit: {
        action: "delete",
        resource: "customer",
        resourceId: id,
        changes: [
          {
            field: "deletedAt",
            oldValue: d.deletedAt || null,
            newValue: "serverTimestamp",
          },
          {
            field: "deletedBy",
            oldValue: d.deletedBy || null,
            newValue: me.uid,
          },
        ],
      },
    });
  } catch (auditError) {
    console.error("audit log error:", auditError);
  }

  return NextResponse.json({ ok: true });
}
