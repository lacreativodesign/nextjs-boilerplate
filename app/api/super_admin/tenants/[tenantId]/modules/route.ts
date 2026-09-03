import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import { invalidateTenantPlanCache } from '@/app/lib/plan-enforcement';
import { createRoleNotifications } from '@/lib/notifications';
import { validateRequest } from '@/lib/validations/validate';
import { updateTenantModulesSchema } from '@/lib/validations/tenant-admin';

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

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const user = await requireSuperAdmin(req);
    const tenantId = params.tenantId;
    // SOC2 F-06: `typeof value === 'object'` was the only check, and the map was then
    // written to the tenant document verbatim — any key, any value type. That map is
    // read by resolveTenantModules and cached by the plan layer, so a malformed value
    // becomes a stale entitlement decision that outlives the request. Keys are now
    // constrained to the canonical module list and values to booleans.
    const { modulesEnabled } = validateRequest(
      updateTenantModulesSchema,
      await req.json().catch(() => ({})),
    );

    const tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });
    }
    const tenantData = tenantSnap.data() || {};
    const currentModules = (tenantData.modulesEnabled || {}) as ModuleMap;

    await tenantRef.set(
      {
        modulesEnabled,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    );

    // S9: modulesEnabled feeds resolveTenantModules, so the cached plan state is now
    // stale on this instance. Best-effort — other warm instances converge on the TTL.
    invalidateTenantPlanCache(tenantId);

    await writeAuditLog({
      tenantId,
      actorUserId: user.uid,
      actorName: user.displayName || user.email || null,
      actorRole: user.role,
      actionType: 'tenant_modules_updated',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { modulesEnabled },
    });

    const moduleChanges = diffModules(currentModules, modulesEnabled);
    const hasChanges = moduleChanges.enabled.length > 0 || moduleChanges.disabled.length > 0;
    if (hasChanges) {
      const summaryParts: string[] = [];
      if (moduleChanges.enabled.length)
        summaryParts.push(`Enabled: ${moduleChanges.enabled.join(', ')}`);
      if (moduleChanges.disabled.length)
        summaryParts.push(`Disabled: ${moduleChanges.disabled.join(', ')}`);
      const body = summaryParts.join(' • ') || 'Module access updated by a super admin.';
      const type = moduleChanges.disabled.length ? 'warning' : 'info';

      await Promise.all([
        createRoleNotifications({
          tenantId,
          roles: ['admin', 'finance'],
          title: 'Module access updated',
          body,
          type,
          priority: moduleChanges.disabled.length ? 'high' : 'normal',
          entityType: 'tenant',
          entityId: tenantId,
          deepLink: '/billing',
          createdBy: { uid: user.uid, name: user.displayName || user.email || 'Super Admin' },
          metadata: {
            enabledModules: moduleChanges.enabled,
            disabledModules: moduleChanges.disabled,
          },
        }),
        createRoleNotifications({
          tenantId,
          roles: ['super_admin'],
          recipientTenantId: null,
          title: 'Module access updated',
          body,
          type,
          priority: moduleChanges.disabled.length ? 'high' : 'normal',
          entityType: 'tenant',
          entityId: tenantId,
          deepLink: `/super_admin/tenants/${tenantId}`,
          createdBy: { uid: user.uid, name: user.displayName || user.email || 'Super Admin' },
          metadata: {
            enabledModules: moduleChanges.enabled,
            disabledModules: moduleChanges.disabled,
          },
        }),
      ]);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
