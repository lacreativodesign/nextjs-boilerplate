import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canManageOwnDeals, requireCrmUser } from "@/lib/crm";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({ message: auth.error, code: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", status: auth.status });
    }
    if (!canManageOwnDeals(auth.user.role)) {
      throw new AppError({ message: "Only sales can request discounts.", code: "FORBIDDEN", status: 403 });
    }

    const payload = await req.json();
    const discountPercent = Number(payload.discountPercent || 0);
    const reason = String(payload.reason || "").trim();

    if (discountPercent <= 0) {
      throw new AppError({ message: "discountPercent must be greater than 0.", code: "VALIDATION_ERROR", status: 400 });
    }

    const dealRef = adminDb.collection("deals").doc(params.id);
    const requestRef = adminDb.collection("discountRequests").doc();

    await adminDb.runTransaction(async (tx) => {
      const dealSnap = await tx.get(dealRef);
      if (!dealSnap.exists) throw new AppError({ message: "Deal not found.", code: "NOT_FOUND", status: 404 });
      const deal = dealSnap.data() || {};

      if (deal.assignedSalesId !== auth.user.uid || deal.tenantId !== auth.tenantId) {
        throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
      }

      const isAutoApproved = discountPercent <= 20;

      tx.set(
        dealRef,
        {
          discountPercent,
          discountApproved: isAutoApproved,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (!isAutoApproved) {
        tx.set(requestRef, {
          id: requestRef.id,
          dealId: params.id,
          requestedBy: auth.user.uid,
          discountPercent,
          reason,
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
          tenantId: auth.tenantId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return NextResponse.json({ ok: true, autoApproved: discountPercent <= 20 });
  } catch (error) {
    logError(error, { route: "POST /api/crm/deals/[id]/discount-request" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to submit discount request.",
      context: { module: "crm", operation: "request-discount" },
    });
    return NextResponse.json(body, { status, headers });
  }
}
