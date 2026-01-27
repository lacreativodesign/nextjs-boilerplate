import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createFinanceEvent,
  parseNumber,
  parseString,
  requireFinance,
  serverTimestamp,
} from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function generateNextInvoiceNumber(tenantId: string, prefix: string) {
  const ref = adminDb.collection("Invoice IDs").doc(tenantId);
  const next = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value || 0) : 0;
    const value = current + 1;
    tx.set(ref, { value }, { merge: true });
    return value;
  });
  const safePrefix = prefix.trim() || "INV";
  return `${safePrefix}-${String(next).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const clientId = parseString(body?.clientId).trim();
    const clientName = parseString(body?.clientName).trim();
    const dealId = parseString(body?.dealId).trim();
    const projectId = parseString(body?.projectId).trim();
    const dueDate = parseString(body?.dueDate).trim();
    const notes = parseString(body?.notes).trim();
    const amountTaxUsd = parseNumber(body?.amountTaxUsd ?? body?.tax, 0);
    const lineItems = Array.isArray(body?.lineItems) ? body.lineItems : [];

    if (!clientId || !clientName) {
      return NextResponse.json({ ok: false, error: "Client is required." }, { status: 400 });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ ok: false, error: "Add at least one line item." }, { status: 400 });
    }

    const normalizedItems = lineItems.map((item: any) => ({
      name: parseString(item?.name).trim(),
      qty: parseNumber(item?.qty, 1),
      unitPriceUsd: parseNumber(item?.unitPriceUsd, 0),
    }));

    const amountSubtotalUsd = normalizedItems.reduce((sum: number, item: any) => {
      return sum + Number(item.qty || 0) * Number(item.unitPriceUsd || 0);
    }, 0);

    const amountTotalUsd = amountSubtotalUsd + amountTaxUsd;

    if (amountTotalUsd <= 0) {
      return NextResponse.json({ ok: false, error: "Invoice amount must be greater than zero." }, { status: 400 });
    }

    const settingsSnap = await adminDb.collection("settings").doc("finance").get();
    const prefix = parseString(settingsSnap.data()?.invoicePrefix, "INV");
    const invoiceNumber = await generateNextInvoiceNumber(auth.tenantId, prefix);

    const ref = adminDb.collection("invoices").doc();
    const createdBy = { uid: auth.user.uid, role: auth.user.role };
    const payload = {
      tenantId: auth.tenantId,
      clientId,
      clientName,
      dealId: dealId || null,
      projectId: projectId || null,
      invoiceNumber,
      orderId: invoiceNumber,
      currency: "USD",
      amount: amountSubtotalUsd,
      tax: amountTaxUsd || null,
      totalAmount: amountTotalUsd,
      amountSubtotalUsd,
      amountTaxUsd,
      amountTotalUsd,
      status: "draft",
      issuedAt: null,
      paidAt: null,
      totalPaid: 0,
      balanceDue: amountTotalUsd,
      dueDate: dueDate ? new Date(dueDate) : null,
      lineItems: normalizedItems,
      notes: notes || null,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    await ref.set(payload);

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], auth.tenantId);

    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Invoice created",
          body: `Invoice ${invoiceNumber} created for ${clientName}.`,
          type: "info",
          entityType: "invoice",
          entityId: ref.id,
          deepLink: "/finance/invoices",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId: auth.tenantId,
          roleTarget: "finance",
        })
      )
    );

    await createFinanceEvent({
      type: "finance.invoice_created",
      title: "Invoice created",
      description: `Invoice ${invoiceNumber} created for ${clientName}.`,
      entityType: "invoice",
      entityId: ref.id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      metadata: { tenantId: auth.tenantId },
    });

    const auditAfter = {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await logEvent({
      tenantId: auth.tenantId,
      type: "finance.invoice_created",
      title: "Invoice created",
      description: `Invoice ${invoiceNumber} created for ${clientName}.`,
      entityType: "invoice",
      entityId: ref.id,
      actor: { uid: auth.user.uid, name: actorName },
      metadata: { before: null, after: auditAfter },
    });

    return NextResponse.json({ ok: true, id: ref.id, invoiceNumber });
  } catch (err: any) {
    console.error("finance/invoices create error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to create invoice.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
