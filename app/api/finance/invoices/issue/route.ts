import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseString, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { normalizeInvoiceStatus } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Invoice id is required." }, { status: 400 });
    }

    const ref = adminDb.collection("invoices").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
    }

    const invoice = snap.data() || {};
    if (String(invoice.tenantId || "") !== auth.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const currentStatus = normalizeInvoiceStatus(invoice.status);
    if (currentStatus === "paid") {
      return NextResponse.json({ ok: false, error: "Paid invoices are immutable." }, { status: 400 });
    }
    if (currentStatus === "void") {
      return NextResponse.json({ ok: false, error: "Void invoices cannot be issued." }, { status: 400 });
    }

    const issuedAtIso = invoice.issuedAt ? new Date(invoice.issuedAt.toDate?.() ?? invoice.issuedAt).toISOString() : new Date().toISOString();
    const nextPayload = {
      status: "issued",
      issuedAt: invoice.issuedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await ref.update(nextPayload);

    const invoiceNumber = String(invoice.invoiceNumber || invoice.orderId || id);
    const clientName = String(invoice.clientName || "");
    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], auth.tenantId);

    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Invoice issued",
          body: `Invoice ${invoiceNumber} issued for ${clientName || "client"}.`,
          type: "info",
          entityType: "invoice",
          entityId: id,
          deepLink: "/finance/invoices",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId: auth.tenantId,
          roleTarget: "finance",
        })
      )
    );

    await createFinanceEvent({
      type: "finance.invoice_issued",
      title: "Invoice issued",
      description: `Invoice ${invoiceNumber} issued for ${clientName || "client"}.`,
      entityType: "invoice",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      metadata: { tenantId: auth.tenantId },
    });

    await logEvent({
      tenantId: auth.tenantId,
      type: "finance.invoice_issued",
      title: "Invoice issued",
      description: `Invoice ${invoiceNumber} issued.`,
      entityType: "invoice",
      entityId: id,
      actor: { uid: auth.user.uid, name: actorName },
      metadata: {
        before: invoice,
        after: { ...invoice, status: "issued", issuedAt: issuedAtIso, updatedAt: new Date().toISOString() },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("finance/invoices issue error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to issue invoice.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
