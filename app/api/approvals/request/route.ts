import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/email-service";
import { getCurrentUser, normalizeRole } from "../../admin/_utils";
import { requireApprovalsModule } from "../_utils";

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
    const moduleAccess = await requireApprovalsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }
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

    // Email approvers — non-blocking
    if (requiredRole) {
      getUsersByRoles([requiredRole, "admin"], tenantId).then((approvers) => {
        const typeLabel = type === "discount" ? "Discount Approval" : type === "change_request" ? "Change Request Approval" : "Production Override";
        return Promise.all(approvers.map((approver) =>
          sendEmail({
            to: approver.email || "",
            subject: `⏳ Approval needed — ${typeLabel}`,
            html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Action Required</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#D97706;">⏳ Approval Required</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">An item is waiting for your approval.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Type</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${typeLabel}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Entity</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${entityType} — ${entityId}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Requested by</td><td style="font-weight:600;color:#1E293B;text-align:right;">${me.name || me.fullName || me.email || "Team member"}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/approvals" style="display:inline-block;padding:12px 24px;background:#D97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Review & Approve →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
          }).catch(() => {})
        ));
      }).catch((err) => console.error("[APPROVAL_REQUEST] Failed to email approvers", err));
    }

    return NextResponse.json({ ok: true, id: approvalId });
  } catch (err: any) {
    console.error("approvals/request error:", err);
    return NextResponse.json({ ok: false, error: "Unable to request approval." }, { status: 500 });
  }
}
