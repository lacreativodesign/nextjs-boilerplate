import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import {
  getCurrentUser,
  isAdminOrSuper,
  isAmManager,
  isProductionManager,
  isSalesManager,
  normalizeRole,
} from "../../admin/_utils";
import { requireApprovalsModule } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApprovalItem = {
  id: string;
  tenantId: string;
  kind: "discount" | "change_request" | "payment_exception";
  title: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  requestedByName?: string;
  entityType: string;
  entityId: string;
  deepLink: string;
  meta: Record<string, unknown>;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where("tenantId", "==", tenantId)];
  if (tenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where("tenantId", "==", null));
  }
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = normalizeRole(me.role);
    const tenantId = normalizeTenantId(me.tenantId);
    const moduleAccess = await requireApprovalsModule(tenantId, role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const canView =
      isAdminOrSuper(role) || isSalesManager(role) || isProductionManager(role) || isAmManager(role);
    if (!canView) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const approvals: ApprovalItem[] = [];

    if (isAdminOrSuper(role) || isSalesManager(role)) {
      const dealsSnap = await queryWithTenant(
        adminDb.collection("deals").where("discountStatus", "==", "pending"),
        tenantId
      );
      dealsSnap.forEach((doc) => {
        const data = doc.data() || {};
        approvals.push({
          id: doc.id,
          tenantId,
          kind: "discount",
          title: String(data.dealName || data.leadName || "Discount request"),
          status: "pending",
          requestedAt: toISO(data.discountRequestedAt || data.updatedAt || data.createdAt) || "",
          requestedByName: String(data.discountRequestedByName || data.ownerName || ""),
          entityType: "deal",
          entityId: doc.id,
          deepLink: "/sales_manager/deals",
          meta: {
            discountPct: data.discountPct ?? 0,
            listPriceUsd: data.listPriceUsd ?? data.valueUsd ?? 0,
            finalPriceUsd: data.finalPriceUsd ?? data.valueUsd ?? 0,
            ownerName: data.ownerName || "",
          },
        });
      });
    }

    if (isAdminOrSuper(role) || isSalesManager(role) || isProductionManager(role) || isAmManager(role)) {
      const changeDocs = await queryWithTenant(
        adminDb
          .collection("changeRequests")
          .where("isDeleted", "==", false)
          .where("status", "in", ["Submitted", "In Review"]),
        tenantId
      );

      let allowedChangeDocs = changeDocs;

      if (isAmManager(role)) {
        const projectSnap = await adminDb
          .collection("projects")
          .where("isDeleted", "==", false)
          .where("ownerAmUid", "==", me.uid)
          .get();
        const projectIds = new Set(projectSnap.docs.map((doc) => doc.id));
        allowedChangeDocs = changeDocs.filter((doc) => projectIds.has(String(doc.data()?.projectId || "")));
      }

      allowedChangeDocs.forEach((doc) => {
        const data = doc.data() || {};
        if (data.internalApproved === true) return;
        const requestedAt = toISO(data.createdAt || data.updatedAt) || "";
        const deepLink = isAmManager(role)
          ? "/am/change-requests"
          : isProductionManager(role)
          ? "/production/qa"
          : "/admin/projects/change-requests";
        approvals.push({
          id: doc.id,
          tenantId,
          kind: "change_request",
          title: String(data.title || "Change request"),
          status: "pending",
          requestedAt,
          requestedByName: String(data.requestedByName || data.requestedByUid || ""),
          entityType: "change_request",
          entityId: doc.id,
          deepLink,
          meta: {
            projectId: data.projectId || "",
            projectName: data.projectName || "",
            clientName: data.clientName || "",
            priority: data.priority || "Medium",
          },
        });
      });
    }

    if (isAdminOrSuper(role) || isProductionManager(role) || isAmManager(role)) {
      const invoiceNeedsReview = await queryWithTenant(
        adminDb.collection("invoices").where("needsReview", "==", true),
        tenantId
      );
      const invoiceStatusReview = await queryWithTenant(
        adminDb.collection("invoices").where("status", "==", "needs_review"),
        tenantId
      );
      const invoiceMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      [...invoiceNeedsReview, ...invoiceStatusReview].forEach((doc) => invoiceMap.set(doc.id, doc));
      invoiceMap.forEach((doc) => {
        const data = doc.data() || {};
        approvals.push({
          id: doc.id,
          tenantId,
          kind: "payment_exception",
          title: String(data.invoiceNumber || data.title || "Payment exception"),
          status: "pending",
          requestedAt: toISO(data.updatedAt || data.createdAt) || "",
          requestedByName: String(data.createdByName || ""),
          entityType: "invoice",
          entityId: doc.id,
          deepLink: "/admin/finance/invoices",
          meta: {
            clientName: data.clientName || "",
            amountUsd: data.amountTotalUsd ?? data.amountUsd ?? 0,
            status: data.status || "",
          },
        });
      });
    }

    approvals.sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));

    return NextResponse.json({ ok: true, approvals });
  } catch (err: any) {
    console.error("approvals list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load approvals.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
