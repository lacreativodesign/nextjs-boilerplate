import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { getCurrentUser, normalizeRole } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_TYPES = ["discount", "change_request", "production_override"] as const;
const ENTITY_TYPES = ["deal", "project", "task"] as const;

type ApprovalType = (typeof APPROVAL_TYPES)[number];
type EntityType = (typeof ENTITY_TYPES)[number];

function parseString(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isValidType(value: string): value is ApprovalType {
  return APPROVAL_TYPES.includes(value as ApprovalType);
}

function isValidEntity(value: string): value is EntityType {
  return ENTITY_TYPES.includes(value as EntityType);
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

function canRequest(type: ApprovalType, role: string) {
  const normalized = normalizeRole(role);
  if (normalized === "admin" || normalized === "super_admin") return true;
  if (type === "discount") return ["sales", "sales_manager"].includes(normalized);
  if (type === "change_request") return ["am", "am_manager"].includes(normalized);
  if (type === "production_override") return ["production", "production_manager"].includes(normalized);
  return false;
}

function collectionForEntity(entityType: EntityType) {
  switch (entityType) {
    case "deal":
      return "deals";
    case "project":
      return "projects";
    case "task":
      return "tasks";
    default:
      return "";
  }
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const typeRaw = parseString(body?.type);
    const entityTypeRaw = parseString(body?.entityType);
    const entityId = parseString(body?.entityId);
    const requestedData = typeof body?.requestedData === "object" && body?.requestedData ? body.requestedData : {};

    if (!isValidType(typeRaw) || !isValidEntity(entityTypeRaw) || !entityId) {
      return NextResponse.json({ ok: false, error: "Invalid approval request." }, { status: 400 });
    }

    const type = typeRaw as ApprovalType;
    const entityType = entityTypeRaw as EntityType;
    const role = normalizeRole(me.role || "");

    if (!canRequest(type, role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (type === "discount" && entityType !== "deal") {
      return NextResponse.json({ ok: false, error: "Invalid approval entity." }, { status: 400 });
    }
    if (type === "change_request" && entityType !== "project") {
      return NextResponse.json({ ok: false, error: "Invalid approval entity." }, { status: 400 });
    }
    if (type === "production_override" && !["project", "task"].includes(entityType)) {
      return NextResponse.json({ ok: false, error: "Invalid approval entity." }, { status: 400 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const entityCollection = collectionForEntity(entityType);
    if (!entityCollection) {
      return NextResponse.json({ ok: false, error: "Unsupported entity type." }, { status: 400 });
    }

    const entityRef = adminDb.collection(entityCollection).doc(entityId);
    const entitySnap = await entityRef.get();
    if (!entitySnap.exists) {
      return NextResponse.json({ ok: false, error: "Entity not found." }, { status: 404 });
    }

    const entityData = entitySnap.data() || {};
    if (docTenantId(entityData) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let changeRequestData: Record<string, any> | null = null;
    if (type === "change_request") {
      const changeRequestId = parseString(requestedData?.changeRequestId);
      if (!changeRequestId) {
        return NextResponse.json({ ok: false, error: "Missing change request id." }, { status: 400 });
      }
      const changeSnap = await adminDb.collection("changeRequests").doc(changeRequestId).get();
      if (!changeSnap.exists) {
        return NextResponse.json({ ok: false, error: "Change request not found." }, { status: 404 });
      }
      const changeData = changeSnap.data() || {};
      if (docTenantId(changeData) !== tenantId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const projectId = parseString(changeData.projectId || "");
      if (projectId && projectId !== entityId) {
        return NextResponse.json({ ok: false, error: "Change request does not match project." }, { status: 400 });
      }
      changeRequestData = changeData;
    }

    const approvalsRef = adminDb.collection("approvals");
    const existingSnap = await approvalsRef
      .where("tenantId", "==", tenantId)
      .where("type", "==", type)
      .where("entityType", "==", entityType)
      .where("entityId", "==", entityId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    const existingDoc = existingSnap.docs[0] || null;
    const approvalRef = existingDoc ? existingDoc.ref : approvalsRef.doc();
    const approvalId = approvalRef.id;

    await adminDb.runTransaction(async (tx) => {
      if (existingDoc) {
        tx.set(
          approvalRef,
          {
            requestedData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        tx.set(approvalRef, {
          tenantId,
          type,
          entityType,
          entityId,
          requestedBy: {
            uid: me.uid,
            role,
          },
          requestedData,
          status: "pending",
          approvalChain: [{ role: requiredRoleForType(type) }],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (type === "discount") {
        tx.set(
          entityRef,
          {
            discountStatus: "pending",
            discountApproved: false,
            discountApprovalId: approvalId,
            discountRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            discountRequestedByUid: me.uid,
            discountApprovedAt: null,
            discountApprovedByUid: null,
            discountApprovedByName: null,
            discountApprovedPct: null,
            discountApprovedUsd: null,
            discountApprovedFinalPriceUsd: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (type === "change_request") {
        tx.set(
          adminDb.collection("changeRequests").doc(String(requestedData?.changeRequestId || "")),
          {
            approvalStatus: "pending",
            approvalId,
            approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvalRequestedByUid: me.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            tenantId,
          },
          { merge: true }
        );
      }

      if (type === "production_override") {
        tx.set(
          entityRef,
          {
            productionOverrideStatus: "pending",
            productionOverrideApprovalId: approvalId,
            productionOverrideRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            productionOverrideRequestedByUid: me.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            tenantId,
          },
          { merge: true }
        );
      }
    });

    const before =
      type === "discount"
        ? { discountPct: Number(entityData.discountPct || 0), finalPriceUsd: Number(entityData.finalPriceUsd || 0) }
        : type === "change_request"
        ? { status: changeRequestData?.status || entityData.status || "Submitted" }
        : { productionOverrideStatus: entityData.productionOverrideStatus || null };
    const after =
      type === "discount"
        ? { discountPct: requestedData.discountPct, finalPriceUsd: requestedData.finalPriceUsd }
        : type === "change_request"
        ? { approvalStatus: "pending" }
        : { productionOverrideStatus: "pending" };

    await logEvent({
      tenantId,
      type: `${type}.approval.requested`,
      title: "Approval requested",
      description: `Approval requested for ${entityType} ${entityId}.`,
      entityType,
      entityId,
      actor: { uid: me.uid, name: me.name || me.fullName || me.displayName || "" },
      metadata: {
        requestedBy: { uid: me.uid, role },
        requestedData,
        before,
        after,
      },
    });

    const requiredRole = requiredRoleForType(type);
    const recipients = await getUsersByRoles([requiredRole], tenantId);
    await createNotifications({
      recipients,
      tenantId,
      recipientRole: requiredRole,
      type: "approval_requested",
      title: "Approval requested",
      message: `${entityType} ${entityId} requires approval.`,
      entityType,
      entityId,
      createdBy: { uid: me.uid, name: me.name || me.fullName || me.displayName || "" },
    });

    return NextResponse.json({ ok: true, id: approvalId });
  } catch (err: any) {
    console.error("approvals/request error:", err);
    return NextResponse.json({ ok: false, error: "Unable to request approval." }, { status: 500 });
  }
}
