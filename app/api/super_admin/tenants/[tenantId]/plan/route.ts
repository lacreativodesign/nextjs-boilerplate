import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../../../_utils";
import { writeAuditLog } from "@/lib/tenant/audit";
import { normalizePlan, resolvePlanModules, resolveTenantModules } from "@/app/lib/plan-enforcement";
import { createRoleNotifications } from "@/lib/notifications";

type ModuleMap = Record<string, boolean>;

function diffModules(current: ModuleMap, next: ModuleMap) {
  const enabled: string[] = [];
  const disabled: string[] = [];
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(next || {})]);
  keys.forEach((key) => {
    const currentValue = Boolean(current?.[key]);
    const nextValue = Boolean(next?.[key]);
    if (currentValue === nextValue) return;
    if (nextValue) {
      enabled.push(key);
    } else {
      disabled.push(key);
    }
  });
  return { enabled, disabled };
}

function formatModuleSummary(changes: { enabled: string[]; disabled: string[] }) {
  const parts: string[] = [];
  if (changes.enabled.length) {
    parts.push(`Enabled: ${changes.enabled.join(", ")}`);
  }
  if (changes.disabled.length) {
    parts.push(`Disabled: ${changes.disabled.join(", ")}`);
  }
  return parts.join(" • ");
}

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
      actorName: user.displayName || user.email || null,
      actorRole: user.role,
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

    const moduleChanges = diffModules(currentModules, nextModules);
    const hasModuleChanges = moduleChanges.enabled.length > 0 || moduleChanges.disabled.length > 0;
    const hasPlanChange = currentPlan !== nextPlan;

    if (hasPlanChange || hasModuleChanges) {
      const moduleSummary = formatModuleSummary(moduleChanges);
      const details = [
        hasPlanChange ? `Plan: ${currentPlan} → ${nextPlan}` : null,
        moduleSummary || null,
      ]
        .filter(Boolean)
        .join(" • ");

      const title = hasPlanChange ? "Plan updated" : "Module access updated";
      const body = details || "Subscription access updated by a super admin.";
      const type = moduleChanges.disabled.length > 0 ? "warning" : "info";

      await Promise.all([
        createRoleNotifications({
          tenantId,
          roles: ["admin", "finance"],
          title,
          body,
          type,
          priority: moduleChanges.disabled.length > 0 ? "high" : "normal",
          entityType: "tenant",
          entityId: tenantId,
          deepLink: "/billing",
          createdBy: { uid: user.uid, name: user.displayName || user.email || "Super Admin" },
          metadata: {
            oldPlan: currentPlan,
            newPlan: nextPlan,
            enabledModules: moduleChanges.enabled,
            disabledModules: moduleChanges.disabled,
          },
        }),
        createRoleNotifications({
          tenantId,
          roles: ["super_admin"],
          recipientTenantId: null,
          title,
          body,
          type,
          priority: moduleChanges.disabled.length > 0 ? "high" : "normal",
          entityType: "tenant",
          entityId: tenantId,
          deepLink: `/super_admin/tenants/${tenantId}`,
          createdBy: { uid: user.uid, name: user.displayName || user.email || "Super Admin" },
          metadata: {
            oldPlan: currentPlan,
            newPlan: nextPlan,
            enabledModules: moduleChanges.enabled,
            disabledModules: moduleChanges.disabled,
          },
        }),
      ]);
    }

    return NextResponse.json({ ok: true, plan: nextPlan, modules: nextModules });
  } catch (err) {
    const message = (err instanceof Error ? err.message : undefined) || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
