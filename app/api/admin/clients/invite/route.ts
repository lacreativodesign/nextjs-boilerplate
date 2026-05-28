import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { ensureClientPortalAccess } from "@/lib/clientPortal";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const runtime = "nodejs";

function isPaidStatus(value: string | undefined) {
  return String(value || "").trim().toLowerCase() === "paid";
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId || "").trim();

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Missing clientId" }, { status: 400 });
    }

    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const clientData = clientSnap.data() || {};
    if (clientData.tenantId !== current.tenantId) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }
    if (!isPaidStatus(clientData.paymentStatus)) {
      return NextResponse.json({ ok: false, error: "Client must be Paid before inviting." }, { status: 400 });
    }

    const inviteResult = await ensureClientPortalAccess({
      clientId,
      clientData,
      createdByUid: current.uid,
      allowExistingInvite: true,
    });

    return NextResponse.json({
      ok: true,
      clientId,
      uid: inviteResult.uid,
      email: inviteResult.email,
      emailSent: inviteResult.emailSent,
      setPasswordLink: inviteResult.setPasswordLink,
      emailError: inviteResult.emailError,
    });
  } catch (err: any) {
    console.error("CLIENT INVITE ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
