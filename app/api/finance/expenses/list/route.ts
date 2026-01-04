import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

type ExpenseDoc = {
  category?: string;
  vendor?: string;
  currency?: string;
  amountPkr?: number;
  expenseDate?: any;
  status?: string;
  notes?: string | null;
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

    const snap = await adminDb.collection("expenses").where("isDeleted", "==", false).limit(500).get();

    const expenses = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as ExpenseDoc;
      return {
        id: doc.id,
        category: data.category || "",
        vendor: data.vendor || "",
        currency: data.currency || "PKR",
        amountPkr: Number(data.amountPkr || 0),
        expenseDate: toISO(data.expenseDate),
        status: data.status || "Recorded",
        notes: data.notes || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
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
