import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, requireAdmin, parseNumber, parseString, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { queueClientActivationInvite } from "@/lib/clientActivation";
import { logEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/security";
import { CurrencyCode, getCurrency } from "@/lib/finance/currencies";
import { getExchangeRate, storeHistoricalRate } from "@/lib/finance/exchangeRates";

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
    const currencyCode = String(body?.currency || "USD").toUpperCase() as CurrencyCode;

    const lineItems = Array.isArray(body?.lineItems) ? body.lineItems : [];

    if (!clientId || !clientName) {
      return NextResponse.json({ ok: false, error: "Client is required." }, { status: 400 });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ ok: false, error: "Add at least one line item." }, { status: 400 });
    }

    getCurrency(currencyCode);

    const normalizedItems = lineItems.map((item: any) => ({
      name: parseString(item?.name).trim(),
      qty: parseNumber(item?.qty, 1),
      unitPriceUsd: parseNumber(item?.unitPriceUsd, 0),
    }));

    const amountSubtotal = normalizedItems.reduce((sum: number, item: any) => {
      return sum + Number(item.qty || 0) * Number(item.unitPriceUsd || 0);
    }, 0);

    const amountTotal = amountSubtotal + amountTaxUsd;
    const baseCurrency: CurrencyCode = "USD";
    let exchangeRate = 1;
    if (currencyCode !== baseCurrency) {
      exchangeRate = await getExchangeRate(currencyCode, baseCurrency);
      await storeHistoricalRate(currencyCode, baseCurrency, exchangeRate, auth.user.tenantId || "global");
    }

    const amountSubtotalBase = amountSubtotal * exchangeRate;
    const amountTaxBase = amountTaxUsd * exchangeRate;
    const amountTotalBase = amountTotal * exchangeRate;

    const existingInvoiceSnap = await adminDb
      .collection("invoices")
      .where("clientId", "==", clientId)
      .where("isDeleted", "==", false)
      .limit(1)
      .get();
    const isFirstInvoice = existingInvoiceSnap.empty;

    const orderId = await generateNextInvoiceId();
    const ref = adminDb.collection("invoices").doc();

    const invoiceData = {
      orderId,
      clientId,
      clientName,
      currency: currencyCode,
      currencySymbol: getCurrency(currencyCode).symbol,
      baseCurrency,
      exchangeRate,
      amountSubtotal,
      amountTax: amountTaxUsd,
      amountTotal,
      amountSubtotalBase,
      amountTaxBase,
      amountTotalBase,
      amountSubtotalUsd: amountSubtotalBase,
      amountTaxUsd: amountTaxBase,
      amountTotalUsd: amountTotalBase,
      status: "draft",
      totalPaid: 0,
      balanceDue: amountTotal,
      dueDate: dueDate ? new Date(dueDate) : null,
      issuedAt: serverTimestamp(),
      paidAt: null,
      lineItems: normalizedItems,
      notes: notes || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    await ref.set(invoiceData);

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], auth.user.tenantId || null);

    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Invoice created",
          body: `Invoice ${orderId} created for ${clientName}.`,
          type: "info",
          entityType: "invoice",
          entityId: ref.id,
          deepLink: "/admin/finance/invoices",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId: auth.user.tenantId || null,
        })
      )
    );

    await createFinanceEvent({
      type: "finance.invoice_created",
      title: "Invoice created",
      description: `Invoice ${orderId} created for ${clientName}.`,
      entityType: "invoice",
      entityId: ref.id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      tenantId: auth.user.tenantId,
    });

    try {
      const changes = Object.entries(invoiceData)
        .filter(([field]) => !["createdAt", "updatedAt"].includes(field))
        .map(([field, value]) => ({
          field,
          oldValue: null,
          newValue: value,
        }));
      await logEvent({
        type: "finance.invoice_created",
        title: "Invoice created",
        description: `Invoice ${orderId} created for ${clientName}.`,
        entityType: "invoice",
        entityId: ref.id,
        actor: { uid: auth.user.uid, name: actorName },
        metadata: {
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent") || "",
        },
        audit: {
          action: "create",
          resource: "invoice",
          resourceId: ref.id,
          changes,
        },
      });
    } catch (auditError) {
      console.error("audit log error:", auditError);
    }

    if (isFirstInvoice) {
      try {
        const clientSnap = await adminDb.collection("clients").doc(clientId).get();
        if (clientSnap.exists && !clientSnap.data()?.deletedAt) {
          const clientData = clientSnap.data() || {};
          await queueClientActivationInvite({
            clientId,
            clientData: {
              primaryContactEmail: clientData.primaryContactEmail,
              primaryContactName: clientData.primaryContactName,
              companyName: clientData.companyName,
            },
            createdByUid: auth.user.uid,
            reason: "first_invoice_created",
          });
        }
      } catch (inviteError) {
        console.error("client activation invite error:", inviteError);
      }
    }

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
