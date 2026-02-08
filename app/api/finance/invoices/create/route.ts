import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createFinanceEvent,
  parseNumber,
  parseString,
  queueFinanceEmail,
  requireFinance,
  serverTimestamp,
} from "../../_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";
import { computeBalanceDue, computeInvoiceStatus, normalizeInvoiceStatus } from "@/lib/finance/status";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { logEvent } from "@/lib/audit";
import { assertPermission, Permission } from "../../../../lib/permissions";
import { normalizeRole } from "../../../admin/_utils";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { validateRequest } from "@/lib/validations/validate";

export const dynamic = "force-dynamic";

type LineItemInput = {
  name?: string;
  qty?: number;
  unitPriceUsd?: number;
};

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    try {
      assertPermission(auth.user.role, Permission.EditFinance);
    } catch {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      throw new AppError({
        message: "Invalid JSON body.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const normalizedItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.lineItems)
        ? body.lineItems.map((item: LineItemInput) => ({
            description: item?.name,
            quantity: item?.qty,
            unitPrice: item?.unitPriceUsd,
            taxRate: 0,
          }))
        : [];

    const validatedData = validateRequest(createInvoiceSchema, {
      clientId: body?.clientId,
      items: normalizedItems,
      currency: body?.currency || "USD",
      dueDate: body?.dueDate,
      notes: body?.notes,
      status: body?.status || "draft",
      tenantId: auth.user.tenantId || "",
    });
    const orderId = parseString(body?.orderId).trim();
    const clientId = parseString(validatedData.clientId).trim();
    const currency = parseString(validatedData.currency || "USD").toUpperCase();
    const notes = parseString(validatedData.notes || "").trim();
    const lineItems = validatedData.items;
    const statusInput = normalizeInvoiceStatus(validatedData.status);
    const dueDateRaw = parseString(validatedData.dueDate).trim();
    const issuedAtRaw = parseString(body?.issuedAt).trim();
    const dealId = parseString(body?.dealId).trim();
    const type = parseString(body?.type).trim();

    if (!orderId) {
      throw new AppError({
        message: "Order id is required.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    if (!clientId) {
      throw new AppError({
        message: "Client id is required.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    if (currency && currency !== "USD") {
      throw new AppError({
        message: "Only USD invoices are supported.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const sanitizedItems = lineItems.map((item) => {
      const name = parseString(item?.description).trim();
      const qty = parseNumber(item?.quantity, 0);
      const unitPriceUsd = parseNumber(item?.unitPrice, 0);
      if (!name || qty <= 0 || unitPriceUsd < 0) {
        throw new AppError({
          message: "Each line item must include a name, qty, and unit price.",
          code: "VALIDATION_ERROR",
          status: 400,
        });
      }
      return { name, qty, unitPriceUsd };
    });

    const subtotal = sanitizedItems.reduce((sum, item) => sum + item.qty * item.unitPriceUsd, 0);
    const taxAmount = parseNumber(body?.amountTaxUsd, 0);
    if (taxAmount < 0) {
      throw new AppError({
        message: "Tax amount cannot be negative.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const total = subtotal + taxAmount;
    if (total <= 0) {
      throw new AppError({
        message: "Invoice total must be greater than zero.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    if (dueDateRaw && (!dueDate || Number.isNaN(dueDate.getTime()))) {
      throw new AppError({
        message: "Invalid due date.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const issuedAt = issuedAtRaw ? new Date(issuedAtRaw) : null;
    if (issuedAtRaw && (!issuedAt || Number.isNaN(issuedAt.getTime()))) {
      throw new AppError({
        message: "Invalid issued date.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const isSuperAdmin = normalizeRole(auth.user.role || "") === "super_admin";

    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) {
      throw new AppError({
        message: "Client not found.",
        code: "NOT_FOUND",
        status: 404,
      });
    }

    const client = clientSnap.data() || {};
    if (!isSuperAdmin && docTenantId(client) !== tenantId) {
      throw new AppError({
        message: "Forbidden.",
        code: "FORBIDDEN",
        status: 403,
      });
    }

    const clientName = parseString(client.companyName || client.name).trim();
    const totalPaid = parseNumber(body?.totalPaid, 0);
    if (totalPaid < 0 || totalPaid > total) {
      throw new AppError({
        message: "Total paid must be between 0 and the invoice total.",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }
    const status = computeInvoiceStatus({
      currentStatus: statusInput,
      totalPaid,
      totalAmount: total,
    });
    const balanceDue = computeBalanceDue(total, totalPaid);

    const docRef = adminDb.collection("invoices").doc();
    await docRef.set({
      orderId,
      clientId,
      clientName,
      currency: "USD",
      amountSubtotalUsd: subtotal,
      amountTaxUsd: taxAmount,
      amountTotalUsd: total,
      totalPaid,
      balanceDue,
      status,
      dueDate: dueDate || null,
      issuedAt: issuedAt || null,
      paidAt: status === "paid" ? serverTimestamp() : null,
      lineItems: sanitizedItems,
      notes: notes || null,
      dealId: dealId || null,
      type: type || null,
      tenantId,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    await createFinanceEvent({
      type: "finance.invoice_created",
      title: "Invoice created",
      description: `Invoice ${orderId} created for ${clientName || clientId}.`,
      entityType: "invoice",
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      tenantId: auth.user.tenantId,
    });

    try {
      await logEvent({
        type: "finance.invoice_created",
        title: "Invoice created",
        description: `Invoice ${orderId} created for ${clientName || clientId}.`,
        entityType: "invoice",
        entityId: docRef.id,
        actor: { uid: auth.user.uid, name: actorName },
      });
    } catch (auditError) {
      logError(auditError, { route: "audit:finance.invoice_created" });
    }

    const primaryEmail = parseString(client.primaryContactEmail || "").trim();
    if (primaryEmail) {
      queueFinanceEmail({
        to: primaryEmail,
        template: "invoice_created",
        subject: `Invoice ${orderId} created`,
        data: {
          invoiceId: docRef.id,
          orderId,
          clientName: clientName || clientId,
        },
        tenantId: auth.user.tenantId,
      }).catch((emailError) => {
        logError(emailError, { route: "finance.invoice_created.email" });
      });
    }

    return NextResponse.json({ ok: true, invoiceId: docRef.id });
  } catch (err) {
    logError(err, { route: "POST /api/finance/invoices/create" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Unable to create invoice.",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
