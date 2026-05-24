import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, requireAdmin, parseNumber, parseString, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { queueClientActivationInvite } from "@/lib/clientActivation";
import { logEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/security";
import { CurrencyCode, getCurrency } from "@/lib/finance/currencies";
import { currencyConverter } from "@/lib/currency/currencyConverter";
import { TaxCalculator, TaxRate } from "@/lib/tax/taxCalculator";
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";

export const dynamic = "force-dynamic";

async function getTenantOrderPrefix(tenantId: string): Promise<string> {
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  const data = tenantSnap.data() || {};
  const customPrefix = String(data.orderPrefix || "").trim().toUpperCase();
  if (customPrefix) return customPrefix.endsWith("-") ? customPrefix : `${customPrefix}-`;
  return process.env.ERP_ORDER_PREFIX || "INV-";
}

async function generateNextInvoiceId(tenantId: string): Promise<string> {
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  const tenantData = tenantSnap.data() || {};
  const startingNumber = Math.max(1, Number(tenantData.orderStartingNumber || 1));
  const ref = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("counters")
    .doc("invoices");
  const next = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const currentValue = Number(snap.data()?.value || 0);
    const value = currentValue > 0 ? currentValue + 1 : startingNumber;
    tx.set(ref, { value }, { merge: true });
    return value;
  });
  const prefix = await getTenantOrderPrefix(tenantId);
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context is required." }, { status: 400 });
    }

    const body = await req.json();
    const clientId = parseString(body?.clientId).trim();
    const clientName = parseString(body?.clientName).trim();
    const dueDate = parseString(body?.dueDate).trim();
    const notes = parseString(body?.notes).trim();
    const isTaxExempt = Boolean(body?.isTaxExempt);
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

    let taxDetails: Array<{ name: string; rate: number; amount: number }> = [];
    let amountTaxUsd = 0;
    let amountTotal = amountSubtotal;

    if (!isTaxExempt) {
      const taxRatesSnap = await adminDb
        .collection("tenants")
        .doc(auth.user.tenantId)
        .collection("taxRates")
        .where("enabled", "==", true)
        .get();

      const taxRates = taxRatesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: String(data.name || "Tax"),
          rate: Number(data.rate || 0),
          type: data.type === "compound" ? "compound" : "simple",
          applies_to: data.applies_to === "subtotal_plus_other_taxes" ? "subtotal_plus_other_taxes" : "subtotal",
          enabled: Boolean(data.enabled),
        } as TaxRate;
      });

      const calculator = new TaxCalculator(taxRates);
      const taxCalculation = calculator.calculate(amountSubtotal);
      taxDetails = taxCalculation.taxDetails;
      amountTaxUsd = taxCalculation.totalTax;
      amountTotal = taxCalculation.total;
    }

    const baseCurrency: CurrencyCode = "USD";

    if (currencyConverter.needsUpdate()) {
      await currencyConverter.fetchRates();
    }

    const exchangeRate = currencyCode !== baseCurrency ? currencyConverter.getRate(currencyCode, baseCurrency) : 1;

    const amountSubtotalBase = Number((amountSubtotal * exchangeRate).toFixed(2));
    const amountTaxBase = Number((amountTaxUsd * exchangeRate).toFixed(2));
    const amountTotalBase = Number((amountTotal * exchangeRate).toFixed(2));
    const exchangeRateDate = new Date().toISOString();

    const existingInvoiceSnap = await adminDb
      .collection("invoices")
      .where("clientId", "==", clientId)
      .where("isDeleted", "==", false)
      .limit(1)
      .get();
    const isFirstInvoice = existingInvoiceSnap.empty;

    const orderId = await generateNextInvoiceId(auth.user.tenantId);
    const ref = adminDb.collection("invoices").doc();

    const invoiceData = {
      orderId,
      clientId,
      clientName,
      currency: currencyCode,
      currencySymbol: getCurrency(currencyCode).symbol,
      baseCurrency,
      exchangeRate,
      exchangeRateDate,
      amountSubtotal,
      amountTax: amountTaxUsd,
      amountTotal,
      taxDetails,
      isTaxExempt,
      amountSubtotalBase,
      amountTaxBase,
      amountTotalBase,
      amountSubtotalUsd: amountSubtotalBase,
      amountTaxUsd: amountTaxBase,
      amountTotalUsd: amountTotalBase,
      totalUSD: amountTotalBase,
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

    try {
      await dispatchWebhookEvent({
        tenantId: auth.user.tenantId,
        event: "invoice.created",
        entityType: "invoice",
        entityId: ref.id,
        payload: {
          invoiceId: ref.id,
          orderId,
          clientId,
          clientName,
          status: "draft",
          amountTotal,
          currency: currencyCode,
        },
        actor: { uid: auth.user.uid, email: auth.user.email || null, role: auth.user.role || null },
      });
    } catch (webhookError) {
      console.error("invoice.created webhook dispatch error:", webhookError);
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
