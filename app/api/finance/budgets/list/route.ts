import { NextResponse } from "next/server";
import { requireFinance } from "@/app/api/finance/_utils";
import { resolveErrorResponse } from "@/lib/errors";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/logging";
import { checkRateLimit } from "@/lib/security";

type BudgetListRecord = {
  id: string;
  status?: string;
  startDate?: { toDate?: () => Date } | Date;
  endDate?: { toDate?: () => Date } | Date;
  [key: string]: unknown;
};

export const dynamic = "force-dynamic";

function toDate(value: BudgetListRecord["startDate"]): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await checkRateLimit(req, "standard", auth.user.uid);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const ownerId = searchParams.get("ownerId");
    const active = searchParams.get("active") === "true";

    let query = adminDb.collection("budgets").where("tenantId", "==", auth.user.tenantId);

    if (status) query = query.where("status", "==", status);
    if (type) query = query.where("type", "==", type);
    if (ownerId) query = query.where("ownerId", "==", ownerId);

    const snapshot = await query.orderBy("startDate", "desc").get();
    const now = new Date();

    let budgets: BudgetListRecord[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (active) {
      budgets = budgets.filter((budget) => {
        const startDate = toDate(budget.startDate);
        const endDate = toDate(budget.endDate);
        if (!startDate || !endDate) return false;
        return budget.status === "active" && now >= startDate && now <= endDate;
      });
    }

    return NextResponse.json({ ok: true, budgets });
  } catch (err) {
    logError(err, { route: "GET /api/finance/budgets/list" });
    const { status, body } = resolveErrorResponse(err, {
      fallbackMessage: "Failed to fetch budgets",
    });
    return NextResponse.json(body, { status });
  }
}
