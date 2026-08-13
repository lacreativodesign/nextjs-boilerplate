import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import {
  invalidateTenantPlanCache,
  normalizePlan,
  resolvePlanModules,
  resolveTenantModules,
} from '@/app/lib/plan-enforcement';
import { createRoleNotifications } from '@/lib/notifications';
import {
  isComped,
  resolveBillingMode,
  validateCompedGrant,
  type BillingMode,
} from '@/lib/billing/billing-mode';

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
    parts.push(`Enabled: ${changes.enabled.join(', ')}`);
  }
  if (changes.disabled.length) {
    parts.push(`Disabled: ${changes.disabled.join(', ')}`);
  }
  return parts.join(' • ');
}

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;

    const body = await req.json().catch(() => ({}));
    const planProvided = body?.plan !== undefined;
    const modulesProvided = body?.modules !== undefined;
    const billingModeProvided = body?.billingMode !== undefined;

    // A Super Admin must not grant their own workspace more capability than it has paid
    // for — that is the self-dealing this guard exists to prevent. Billing MODE is the
    // opposite case: marking your own workspace comped REMOVES it from revenue and takes
    // capability away from nobody, and Bizosto's own tenant is precisely the workspace
    // that most needs marking. Blocking it forced the field to be set by hand in the
    // Firebase console, which is neither audited nor validated.
    const isSelfTenant = user.tenantId === tenantId;
    if (isSelfTenant && (planProvided || modulesProvided)) {
      return NextResponse.json(
        { ok: false, error: 'Cannot modify your own tenant plan.' },
        { status: 403 },
      );
    }
    if (isSelfTenant && billingModeProvided && resolveBillingMode(body?.billingMode) !== 'comped') {
      return NextResponse.json(
        { ok: false, error: 'Cannot move your own tenant onto Stripe billing.' },
        { status: 403 },
      );
    }

    if (!planProvided && !modulesProvided && !billingModeProvided) {
      return NextResponse.json({ ok: false, error: 'No plan updates provided.' }, { status: 400 });
    }

    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const snap = await tenantRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
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
      planSetBy: { uid: user.uid, role: 'super_admin' },
      planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    };

    // COMP-1: who pays is set here, alongside what they get, because the two decisions
    // are made together — "Enterprise, internally managed" is one thought, not two.
    // `plan` stays the answer to what the workspace can do; `billingMode` answers who
    // pays for it. Neither field has to lie about the other.
    const currentBillingMode = resolveBillingMode(data.billingMode);
    let nextBillingMode: BillingMode = currentBillingMode;

    if (billingModeProvided) {
      nextBillingMode = resolveBillingMode(body?.billingMode);

      if (nextBillingMode === 'comped') {
        const grant = validateCompedGrant(body?.comped, user.uid);
        if (!grant.ok) {
          return NextResponse.json({ ok: false, error: grant.error }, { status: 400 });
        }

        // COMP-3: comping a workspace does not stop Stripe charging it.
        //
        // COMP-1 promises that a comped workspace is never charged, and for a workspace
        // that never had a subscription that is true. Converting an EXISTING paying
        // customer is different: this endpoint sets billingMode and nothing else, so the
        // Stripe subscription stays live and the customer's card keeps being charged every
        // month while the tenant screen reads "Comped — $0". The revenue report compounds
        // it — MRR counts any tenant holding a subscription id as paying, so the workspace
        // does not even appear in the comped column.
        //
        // Cancelling the subscription from here would hide a money-moving action behind a
        // plan edit, which is worse. The operator is told to cancel it first, deliberately
        // and where cancellation is visible, and then mark the workspace comped.
        const liveSubscriptionId = String(data.stripeSubscriptionId || '').trim();
        if (liveSubscriptionId) {
          return NextResponse.json(
            {
              ok: false,
              error:
                'This workspace still has an active Stripe subscription. Cancel it in Stripe first — marking it comped here would not stop the charges.',
              code: 'comp_blocked_active_subscription',
            },
            { status: 409 },
          );
        }

        updates.billingMode = 'comped';
        updates.comped = grant.grant;
      } else {
        // Converting back to Stripe billing clears the grant but keeps the history: the
        // audit record below carries the comp that was revoked, so the period a workspace
        // paid nothing stays answerable.
        updates.billingMode = 'stripe';
        updates.comped = admin.firestore.FieldValue.delete();
      }
    }

    await tenantRef.set(updates, { merge: true });

    // S9: entitlement just changed, so drop this instance's cached plan rather than
    // serving the old one for the rest of the TTL. Best-effort — other warm instances
    // converge on the 30s TTL.
    invalidateTenantPlanCache(tenantId);

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actorName: user.displayName || user.email || null,
      actorRole: user.role,
      actionType: planProvided ? 'tenant_plan_updated' : 'tenant_modules_override_updated',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: {
        oldPlan: currentPlan,
        newPlan: nextPlan,
        oldModules: currentModules,
        newModules: nextModules,
        actorRole: user.role,
        // Forgoing revenue is a commercial decision; it is recorded with a reason and an
        // actor so it stays answerable long after whoever made it has moved on.
        oldBillingMode: currentBillingMode,
        newBillingMode: nextBillingMode,
        oldComped: isComped(data) ? data.comped || null : null,
        newComped: nextBillingMode === 'comped' ? updates.comped || data.comped || null : null,
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
        .join(' • ');

      const title = hasPlanChange ? 'Plan updated' : 'Module access updated';
      const body = details || 'Subscription access updated by a super admin.';
      const type = moduleChanges.disabled.length > 0 ? 'warning' : 'info';

      await Promise.all([
        createRoleNotifications({
          tenantId,
          roles: ['admin', 'finance'],
          title,
          body,
          type,
          priority: moduleChanges.disabled.length > 0 ? 'high' : 'normal',
          entityType: 'tenant',
          entityId: tenantId,
          deepLink: '/billing',
          createdBy: { uid: user.uid, name: user.displayName || user.email || 'Super Admin' },
          metadata: {
            oldPlan: currentPlan,
            newPlan: nextPlan,
            enabledModules: moduleChanges.enabled,
            disabledModules: moduleChanges.disabled,
          },
        }),
        createRoleNotifications({
          tenantId,
          roles: ['super_admin'],
          recipientTenantId: null,
          title,
          body,
          type,
          priority: moduleChanges.disabled.length > 0 ? 'high' : 'normal',
          entityType: 'tenant',
          entityId: tenantId,
          deepLink: `/super_admin/tenants/${tenantId}`,
          createdBy: { uid: user.uid, name: user.displayName || user.email || 'Super Admin' },
          metadata: {
            oldPlan: currentPlan,
            newPlan: nextPlan,
            enabledModules: moduleChanges.enabled,
            disabledModules: moduleChanges.disabled,
          },
        }),
      ]);
    }

    return NextResponse.json({
      ok: true,
      plan: nextPlan,
      modules: nextModules,
      billingMode: nextBillingMode,
    });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
