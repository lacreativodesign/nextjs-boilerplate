import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, serverTimestamp } from "../../_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";
import { calculateNextGenerationDate } from "@/lib/finance/recurring";
import { z } from "zod";

export const dynamic = "force-dynamic";

const recurringLineItemSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  quantity: z.number().min(0.01),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100).optional(),
});

const createRecurringTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  clientId: z.string().min(1, "Client is required"),
  status: z.enum(["draft", "active", "paused", "cancelled"]).default("draft"),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]),
  interval: z.number().int().min(1).default(1),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  customDays: z.number().int().min(1).optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  currency: z.string().min(3),
  taxRateId: z.string().optional(),
  lineItems: z.array(recurringLineItemSchema).min(1),
  notes: z.string().optional(),
  autoSend: z.boolean().default(false),
  generateDaysBefore: z.number().int().min(0).default(0),
  dueDaysAfter: z.number().int().min(1).default(30),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, "standard", auth.user.uid);

    const body = await req.json();
    const validated = createRecurringTemplateSchema.parse(body);

    const startDate = new Date(validated.startDate);
    if (Number.isNaN(startDate.getTime())) {
      throw new AppError({
        message: "Invalid start date",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const endDate = validated.endDate ? new Date(validated.endDate) : undefined;
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new AppError({
        message: "Invalid end date",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    if (endDate && endDate <= startDate) {
      throw new AppError({
        message: "End date must be after start date",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const clientSnap = await adminDb.collection("clients").doc(validated.clientId).get();
    if (!clientSnap.exists) {
      throw new AppError({
        message: "Client not found",
        code: "NOT_FOUND",
        status: 404,
      });
    }

    const client = clientSnap.data();
    if (!client || client.tenantId !== auth.user.tenantId) {
      throw new AppError({
        message: "Forbidden",
        code: "FORBIDDEN",
        status: 403,
      });
    }

    const clientName = client.companyName || client.name || "Unknown";

    let taxRateName: string | undefined;
    let taxRate: number | undefined;

    if (validated.taxRateId) {
      const taxRateSnap = await adminDb.collection("tax_rates").doc(validated.taxRateId).get();
      const rateData = taxRateSnap.data();
      if (taxRateSnap.exists && rateData && rateData.tenantId === auth.user.tenantId) {
        taxRateName = rateData.name;
        taxRate = rateData.rate;
      }
    }

    const nextGenerationDate = calculateNextGenerationDate(
      startDate,
      validated.frequency,
      validated.interval,
      validated.dayOfMonth,
      validated.dayOfWeek,
      validated.customDays,
    );

    const docRef = adminDb.collection("recurring_invoice_templates").doc();
    await docRef.set({
      name: validated.name,
      description: validated.description,
      clientId: validated.clientId,
      clientName,
      status: validated.status,
      frequency: validated.frequency,
      interval: validated.interval,
      dayOfMonth: validated.dayOfMonth,
      dayOfWeek: validated.dayOfWeek,
      customDays: validated.customDays,
      startDate,
      endDate: endDate || null,
      lastGeneratedDate: null,
      nextGenerationDate,
      generatedCount: 0,
      currency: validated.currency,
      taxRateId: validated.taxRateId,
      taxRateName,
      taxRate,
      lineItems: validated.lineItems,
      notes: validated.notes,
      autoSend: validated.autoSend,
      generateDaysBefore: validated.generateDaysBefore,
      dueDaysAfter: validated.dueDaysAfter,
      ownerId: auth.user.uid,
      ownerName: auth.user.name || auth.user.email || "Unknown",
      tenantId: auth.user.tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true, templateId: docRef.id });
  } catch (err) {
    logError(err, { route: "POST /api/finance/recurring-invoices/create" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to create recurring invoice template",
    });
    return NextResponse.json(body, { status });
  }
}
