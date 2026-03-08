import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance, serverTimestamp } from "@/app/api/finance/_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

const budgetCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  allocatedAmount: z.number().min(0),
});

const createBudgetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["revenue", "expense", "project", "department", "custom"]),
  period: z.enum(["monthly", "quarterly", "yearly"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  status: z.enum(["draft", "active", "closed", "revised"]).default("draft"),
  currency: z.string().min(3),
  categories: z.array(budgetCategorySchema).min(1, "At least one category is required"),
  description: z.string().optional(),
  ownerId: z.string().min(1),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, "standard", auth.user.uid);

    const body = await req.json();
    const validated = createBudgetSchema.parse(body);

    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new AppError({
        message: "Invalid start or end date",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    if (endDate <= startDate) {
      throw new AppError({
        message: "End date must be after start date",
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }

    const totalAmount = validated.categories.reduce((sum, cat) => sum + cat.allocatedAmount, 0);

    const categories = validated.categories.map((cat) => ({
      ...cat,
      spentAmount: 0,
      remainingAmount: cat.allocatedAmount,
      percentage: totalAmount > 0 ? (cat.allocatedAmount / totalAmount) * 100 : 0,
    }));

    const ownerDoc = await adminDb.collection("users").doc(validated.ownerId).get();
    const ownerData = ownerDoc.data();
    const ownerName = ownerDoc.exists ? ownerData?.name || ownerData?.email || "Unknown" : "Unknown";

    const docRef = adminDb.collection("budgets").doc();
    await docRef.set({
      name: validated.name,
      type: validated.type,
      period: validated.period,
      startDate,
      endDate,
      status: validated.status,
      currency: validated.currency.toUpperCase(),
      totalAmount,
      categories,
      description: validated.description || null,
      ownerId: validated.ownerId,
      ownerName,
      departmentId: validated.departmentId || null,
      projectId: validated.projectId || null,
      tenantId: auth.user.tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true, budgetId: docRef.id });
  } catch (err) {
    logError(err, { route: "POST /api/finance/budgets/create" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to create budget",
    });
    return NextResponse.json(body, { status });
  }
}
