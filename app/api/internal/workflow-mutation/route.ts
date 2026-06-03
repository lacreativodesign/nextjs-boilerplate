import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/tenant/audit";

export const dynamic = "force-dynamic";

// Collections that automation is never allowed to touch
const PROTECTED_COLLECTIONS = new Set([
  "tenants",
  "users",
  "auditLogs",
  "audit_logs",
  "sessions",
  "admin_settings",
  "platform_settings",
  "super_admin_settings",
  "automation_workflow_runs",
  "stripe_webhooks",
]);

function verifyInternalSecret(req: NextRequest): boolean {
  const secret = req.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  if (!expected || !secret) return false;
  return secret === expected;
}

export async function POST(req: NextRequest) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { action, entity, tenantId, payload, recordId, field, value, workflowId, runId } = body;

  // Validate required fields
  if (!action || !entity || !tenantId) {
    return NextResponse.json({ ok: false, error: "Missing required fields: action, entity, tenantId" }, { status: 400 });
  }

  // Block protected collections
  if (PROTECTED_COLLECTIONS.has(String(entity))) {
    return NextResponse.json(
      { ok: false, error: `Automation is not permitted to modify collection: ${entity}` },
      { status: 403 }
    );
  }

  try {
    switch (action) {
      case "create_record": {
        if (!payload || typeof payload !== "object") {
          return NextResponse.json({ ok: false, error: "Missing payload for create_record" }, { status: 400 });
        }
        const ref = adminDb.collection(String(entity)).doc();
        await ref.set({
          ...payload,
          tenantId,
          createdByWorkflow: workflowId || null,
          createdAt: new Date().toISOString(),
        });
        await writeAuditLog({
          tenantId,
          actorUserId: null,
          actorName: `workflow:${workflowId || "unknown"}`,
          actorRole: "automation",
          actionType: "workflow.create_record",
          entityType: String(entity),
          entityId: ref.id,
          metadata: { workflowId, runId, payload },
        });
        return NextResponse.json({ ok: true, id: ref.id });
      }

      case "update_field": {
        if (!recordId || !field) {
          return NextResponse.json({ ok: false, error: "Missing recordId or field for update_field" }, { status: 400 });
        }
        // Verify document belongs to this tenant before updating
        const docRef = adminDb.collection(String(entity)).doc(String(recordId));
        const snap = await docRef.get();
        if (!snap.exists) {
          return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
        }
        const snapTenantId = snap.data()?.tenantId;
        if (normalizeTenantId(snapTenantId) !== normalizeTenantId(tenantId)) {
          return NextResponse.json({ ok: false, error: "Tenant isolation violation" }, { status: 403 });
        }
        await docRef.set({ [String(field)]: value, updatedAt: new Date().toISOString() }, { merge: true });
        await writeAuditLog({
          tenantId,
          actorUserId: null,
          actorName: `workflow:${workflowId || "unknown"}`,
          actorRole: "automation",
          actionType: "workflow.update_field",
          entityType: String(entity),
          entityId: String(recordId),
          metadata: { workflowId, runId, field, value },
        });
        return NextResponse.json({ ok: true });
      }

      case "delete_record": {
        if (!recordId) {
          return NextResponse.json({ ok: false, error: "Missing recordId for delete_record" }, { status: 400 });
        }
        // Verify document belongs to this tenant before deleting
        const delRef = adminDb.collection(String(entity)).doc(String(recordId));
        const delSnap = await delRef.get();
        if (!delSnap.exists) {
          return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
        }
        const delTenantId = delSnap.data()?.tenantId;
        if (delTenantId && delTenantId !== tenantId) {
          return NextResponse.json({ ok: false, error: "Tenant isolation violation" }, { status: 403 });
        }
        await delRef.delete();
        await writeAuditLog({
          tenantId,
          actorUserId: null,
          actorName: `workflow:${workflowId || "unknown"}`,
          actorRole: "automation",
          actionType: "workflow.delete_record",
          entityType: String(entity),
          entityId: String(recordId),
          metadata: { workflowId, runId },
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[WORKFLOW_MUTATION]", err);
    return NextResponse.json({ ok: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}
