import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { createNotification, type NotificationEntityType } from "@/lib/notifications";
import { getCurrentUser, normalizeRole } from "../../admin/_utils";
import { requireApprovalsModule } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_TYPES = ["discount", "change_request", "production_override"] as const;

type ApprovalType = (typeof APPROVAL_TYPES)[number];

type ApprovalDoc = {
  tenantId?: string;
  type?: ApprovalType;
  entityType?: string;
  entityId?: string;
  requestedBy?: { uid?: string; role?: string };
  requestedData?: Record<string, any>;
  status?: string;
  approvalChain?: Array<{
    role?: string;
    uid?: string;
    decision?: "approved" | "rejected";
    note?: string;
    decidedAt?: any;
  }>;
};

function parseString(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requiredRoleForType(type: ApprovalType) {
  switch (type) {
    case "discount":
      return "sales_manager";
    case "change_request":
      return "am_manager";
    case "production_override":
      return "production_manager";
    default:
      return "";
  }
}

function canReject(type: ApprovalType, role: string) {
  const normalized = normalizeRole(role);
  if (normalized === "admin" || normalized === "super_admin") return true;
  return normalized === requiredRoleForType(type);
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const approvalId = parseString(body?.id);
    const note = parseString(body?.note);

    if (!approvalId) {
      return NextResponse.json({ ok: false, error: "Missing approval id." }, { status: 400 });
    }

    const approvalRef = adminDb.collection("approvals").doc(approvalId);
    const approvalSnap = await approvalRef.get();
    if (!approvalSnap.exists) {
      return NextResponse.json({ ok: false, error: "Approval not found." }, { status: 404 });
    }

    const approval = approvalSnap.data() as ApprovalDoc;
    const type = approval.type as ApprovalType;
    const entityId = parseString(approval.entityId);
    const tenantId = normalizeTenantId(approval.tenantId || me.tenantId);
    const moduleAccess = await requireApprovalsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }

    if (!type || !APPROVAL_TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: "Unsupported approval type." }, { status: 400 });
    }
    if (!entityId) {
      return NextResponse.json({ ok: false, error: "Approval missing entity id." }, { status: 400 });
    }

    if (normalizeTenantId(me.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (approval.status !== "pending") {
      return NextResponse.json({ ok: true, status: "already_processed" });
    }

    if (approval.requestedBy?.uid && approval.requestedBy.uid === me.uid) {
      return NextResponse.json({ ok: false, error: "Requester cannot reject their own request." }, { status: 403 });
    }

    if (!canReject(type, me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const normalizedRole = normalizeRole(me.role || "");
    const approvalChain = Array.isArray(approval.approvalChain) ? [...approval.approvalChain] : [];
    const requiredRole = requiredRoleForType(type);
    const decisionEntry = {
      role: requiredRole,
      uid: me.uid,
      decision: "rejected" as const,
      note: note || undefined,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const chainIndex = approvalChain.findIndex((entry) => entry?.role === requiredRole && !entry?.decision);
    if (chainIndex >= 0) {
      approvalChain[chainIndex] = { ...approvalChain[chainIndex], ...decisionEntry };
    } else {
      approvalChain.push(decisionEntry);
    }

    const requestedData = approval.requestedData || {};
    const actorName = me.name || me.fullName || me.displayName || "";
    const changeRequestId = parseString(requestedData.changeRequestId);

    if (type === "change_request" && !changeRequestId) {
      return NextResponse.json({ ok: false, error: "Approval missing change request id." }, { status: 400 });
    }

    let alreadyProcessed = false;
    await adminDb.runTransaction(async (tx) => {
      const approvalTxSnap = await tx.get(approvalRef);
      if (!approvalTxSnap.exists) {
        throw new Error("Approval not found");
      }
      const approvalTxData = approvalTxSnap.data() || {};
      if (String(approvalTxData.status || "") !== "pending") {
        alreadyProcessed = true;
        return;
      }

      tx.set(
        approvalRef,
        {
          status: "rejected",
          approvalChain,
          finalDecisionBy: { uid: me.uid, role: normalizedRole },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (type === "discount") {
        const dealRef = adminDb.collection("deals").doc(entityId);
        const dealSnap = await tx.get(dealRef);
        if (!dealSnap.exists) {
          throw new Error("Deal not found");
        }
        const dealData = dealSnap.data() || {};
        if (docTenantId(dealData) !== tenantId) {
          throw new Error("Forbidden");
        }
        tx.set(
          dealRef,
          {
            discountApproved: false,
            discountStatus: "rejected",
            discountApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
            discountApprovedByUid: me.uid,
            discountApprovedByName: actorName,
            discountApprovedPct: null,
            discountApprovedUsd: null,
            discountApprovedFinalPriceUsd: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (type === "change_request") {
        const changeRef = adminDb.collection("changeRequests").doc(changeRequestId);
        const changeSnap = await tx.get(changeRef);
        if (!changeSnap.exists) {
          throw new Error("Change request not found");
        }
        const changeData = changeSnap.data() || {};
        if (docTenantId(changeData) !== tenantId) {
          throw new Error("Forbidden");
        }
        const statusHistory = Array.isArray(changeData.statusHistory) ? [...changeData.statusHistory] : [];
        statusHistory.push({
          from: changeData.status || "Submitted",
          to: "Rejected",
          byUid: me.uid,
          byRole: normalizedRole,
          at: admin.firestore.Timestamp.now(),
          note: note || "Manager rejection",
        });
        tx.set(
          changeRef,
          {
            status: "Rejected",
            approvalStatus: "rejected",
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectedByUid: me.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            statusHistory,
            tenantId,
          },
          { merge: true }
        );
      }

      if (type === "production_override") {
        const projectRef = adminDb.collection("projects").doc(entityId);
        const projectSnap = await tx.get(projectRef);
        if (!projectSnap.exists) {
          throw new Error("Project not found");
        }
        const projectData = projectSnap.data() || {};
        if (docTenantId(projectData) !== tenantId) {
          throw new Error("Forbidden");
        }
        tx.set(
          projectRef,
          {
            productionOverrideStatus: "rejected",
            productionOverrideRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            productionOverrideRejectedByUid: me.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            tenantId,
          },
          { merge: true }
        );
      }
    });

    if (alreadyProcessed) {
      return NextResponse.json({ ok: true, status: "already_processed" });
    }

    const before =
      type === "discount"
        ? { discountStatus: "pending", discountPct: requestedData.discountPct ?? null }
        : type === "change_request"
        ? { approvalStatus: "pending", status: requestedData.status || "Submitted" }
        : { productionOverrideStatus: "pending" };
    const after =
      type === "discount"
        ? { discountStatus: "rejected", discountApprovedPct: null }
        : type === "change_request"
        ? { approvalStatus: "rejected", status: "Rejected" }
        : { productionOverrideStatus: "rejected" };

    await logEvent({
      tenantId,
      type: `${type}.approval.rejected`,
      title: "Approval rejected",
      description: `Approval rejected for ${approval.entityType || "entity"} ${approval.entityId || ""}.`,
      entityType: (approval.entityType || null) as NotificationEntityType | null,
      entityId: approval.entityId || null,
      actor: { uid: me.uid, name: actorName },
      metadata: {
        requestedBy: approval.requestedBy || null,
        rejectedBy: { uid: me.uid, role: normalizedRole },
        requestedData,
        before,
        after,
      },
    });

    if (approval.requestedBy?.uid) {
      await createNotification({
        recipientUid: approval.requestedBy.uid,
        recipientRole: approval.requestedBy.role || null,
        tenantId,
        type: "approval_decision",
        title: "Approval rejected",
        message: `${approval.entityType || "Request"} ${approval.entityId || ""} was rejected.`,
        entityType: (approval.entityType || null) as NotificationEntityType | null,
        entityId: approval.entityId || null,
        createdBy: { uid: me.uid, name: actorName },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("approvals/reject error:", err);
    const message = String(err?.message || "Unable to reject.");
    const status = message.toLowerCase().includes("forbidden") ? 403 : message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
