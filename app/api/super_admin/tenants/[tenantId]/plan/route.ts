import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../../../_utils";
import { writeAuditLog } from "@/lib/tenant/audit";
import { normalizePlan, resolvePlanModules, resolveTenantModules } from "@/app/lib/plan-enforcement";

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;

    if (user.tenantId === tenantId) {
      return NextResponse.json({ ok: false, error: "Cannot modify your own tenant plan." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const planProvided = body?.plan !== undefined;
    const modulesProvided = body?.modules !== undefined;

    if (!planProvided && !modulesProvided) {
      return NextResponse.json({ ok: false, error: "No plan updates provided." }, { status: 400 });
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const snap = await tenantRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const data = snap.data() || {};
    const currentPlan = normalizePlan(data.plan);
    const currentModules = resolveTenantModules({
      plan: currentPlan,
      modules: data.modules,
      legacyModulesEnabled: data.modulesEnabled,
    });

    const nextPlan = planProvided ? normalizePlan(body?.plan) : currentPlan;
    const nextModules = planProvided
      ? resolvePlanModules(nextPlan, modulesProvided ? body?.modules : {})
      : resolvePlanModules(currentPlan, modulesProvided ? body?.modules : currentModules);

    const updates: Record<string, unknown> = {
      plan: nextPlan,
      modules: nextModules,
      planSetBy: { uid: user.uid, role: "super_admin" },
      planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    };

    await tenantRef.set(updates, { merge: true });

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actionType: planProvided ? "tenant_plan_updated" : "tenant_modules_override_updated",
      entityType: "tenant",
      entityId: tenantId,
      metadata: {
        oldPlan: currentPlan,
        newPlan: nextPlan,
        oldModules: currentModules,
        newModules: nextModules,
        actorRole: user.role,
      },
    });

    return NextResponse.json({ ok: true, plan: nextPlan, modules: nextModules });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
