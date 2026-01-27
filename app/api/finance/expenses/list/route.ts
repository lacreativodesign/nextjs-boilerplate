import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

type ExpenseDoc = {
  tenantId?: string;
  category?: string;
  vendor?: string;
  currency?: string;
  amount?: number;
  amountPkr?: number;
  expenseDate?: any;
  incurredAt?: any;
  status?: string;
  notes?: string | null;
  note?: string | null;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection("expenses")
      .where("tenantId", "==", auth.tenantId)
      .where("isDeleted", "==", false)
      .limit(500)
      .get();

    const expenses = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as ExpenseDoc;
      const amountPkr = Number(data.amountPkr ?? data.amount ?? 0);
      return {
        id: doc.id,
        category: data.category || "",
        vendor: data.vendor || "",
        currency: data.currency || "PKR",
        amountPkr,
        amount: Number(data.amount ?? amountPkr),
        expenseDate: toISO(data.expenseDate || data.incurredAt),
        incurredAt: toISO(data.incurredAt || data.expenseDate),
        status: data.status || "Recorded",
        notes: data.notes || data.note || null,
        note: data.note || data.notes || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
        tenantId: data.tenantId || auth.tenantId,
      };
    });

    return NextResponse.json({ ok: true, expenses });
  } catch (err: any) {
    console.error("finance/expenses list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load expenses.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
