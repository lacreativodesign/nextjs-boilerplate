import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type ExpenseDoc = {
  category?: string;
  vendor?: string;
  currency?: string;
  amountPkr?: number;
  amountUsd?: number;
  expenseDate?: any;
  month?: number;
  year?: number;
  createdByUid?: string | null;
  tenantId?: string | null;
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

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const queries = [adminDb.collection("expenses").where("isDeleted", "==", false).where("tenantId", "==", tenantId)];
    if (tenantId === DEFAULT_TENANT_ID) {
      queries.push(adminDb.collection("expenses").where("isDeleted", "==", false).where("tenantId", "==", null));
    }
    const snapshots = await Promise.all(queries.map((query) => query.limit(500).get()));
    const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    snapshots.forEach((snap) => {
      snap.docs.forEach((doc) => {
        if (docTenantId(doc.data()) === tenantId) {
          docs.set(doc.id, doc);
        }
      });
    });

    const expenses = Array.from(docs.values()).map((doc) => {
      const data = (doc.data() || {}) as ExpenseDoc;
      return {
        id: doc.id,
        tenantId: data.tenantId || DEFAULT_TENANT_ID,
        category: data.category || "",
        vendor: data.vendor || "",
        currency: data.currency || "PKR",
        amountPkr: Number(data.amountPkr || 0),
        amountUsd: Number(data.amountUsd || 0),
        expenseDate: toISO(data.expenseDate),
        month: Number(data.month || 0),
        year: Number(data.year || 0),
        createdByUid: data.createdByUid || null,
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
