import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";
import { toPaymentStatusLabel } from "@/lib/finance/status";
import { executeMonitoredQuery, getPageSize } from "@/lib/firestore/query-performance";

export const dynamic = "force-dynamic";

type PaymentDoc = {
  clientId?: string;
  clientName?: string;
  invoiceId?: string | null;
  orderId?: string | null;
  currency?: string;
  amountUsd?: number;
  method?: string;
  status?: string;
  notes?: string | null;
  paidAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSize = getPageSize(searchParams.get("limit"));

    let query: FirebaseFirestore.Query = adminDb
      .collection("payments")
      .where("tenantId", "==", auth.user.tenantId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(pageSize);

    if (cursor) {
      const cursorDoc = await adminDb.collection("payments").doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await executeMonitoredQuery(() => query.get(), {
      route: "GET /api/finance/payments/list",
      tenantId: auth.user.tenantId,
      queryName: "finance_payments_list",
      metadata: { limit: pageSize, cursor: cursor || null },
    });

    const payments = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as PaymentDoc;
      return {
        id: doc.id,
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        invoiceId: data.invoiceId || null,
        orderId: data.orderId || null,
        currency: data.currency || "USD",
        amountUsd: Number(data.amountUsd || 0),
        method: data.method || "Other",
        status: toPaymentStatusLabel(data.status),
        notes: data.notes || null,
        paidAt: toISO(data.paidAt),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      payments,
      pagination: {
        limit: pageSize,
        nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null,
      },
      currentUser: {
        uid: auth.user.uid,
        role: auth.user.role,
        name: auth.user.name || auth.user.fullName || auth.user.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("finance/payments list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load payments.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
