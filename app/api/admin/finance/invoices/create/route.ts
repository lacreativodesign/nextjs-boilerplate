import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, parseNumber, parseString, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

async function generateNextInvoiceId() {
  const ref = adminDb.collection("Invoice IDs").doc("counter");
  const next = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value || 0) : 0;
    const value = current + 1;
    tx.set(ref, { value }, { merge: true });
    return value;
  });
  return `INV-${String(next).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const clientId = parseString(body?.clientId).trim();
    const clientName = parseString(body?.clientName).trim();
    const dueDate = parseString(body?.dueDate).trim();
    const notes = parseString(body?.notes).trim();
    const amountTaxUsd = parseNumber(body?.amountTaxUsd, 0);

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

    const orderId = await generateNextInvoiceId();
    const ref = adminDb.collection("invoices").doc();

    await ref.set({
      orderId,
      clientId,
      clientName,
      currency: "USD",
      amountSubtotalUsd,
      amountTaxUsd,
      amountTotalUsd,
      status: "Draft",
      dueDate: dueDate ? new Date(dueDate) : null,
      issuedAt: serverTimestamp(),
      paidAt: null,
      lineItems: normalizedItems,
      notes: notes || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    });

    return NextResponse.json({ ok: true, id: ref.id, orderId });
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
