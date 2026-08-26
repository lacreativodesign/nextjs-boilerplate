import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_TENANT_ID } from '@/lib/tenant/constants';
import { createNotification } from '@/lib/notifications';
import { getCurrentUser, isAdminRole, isSuperAdmin } from '../_utils';

export const runtime = 'nodejs';

export const WORKFLOW_STAGES = [
  'Kickoff',
  'Draft',
  'Review',
  'Revisions',
  'Final',
  'Delivered',
] as const;
export const SALES_PIPELINE_STAGES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Proposal Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const;

export const DEFAULT_WORKFLOW_SETTINGS = {
  projectStages: [...WORKFLOW_STAGES],
  slaDaysPerStage: {
    Kickoff: 3,
    Draft: 5,
    Review: 5,
    Revisions: 7,
    Final: 3,
    Delivered: 0,
  },
  atRiskAfterDays: 7,
  overdueAfterDays: 0,
};

export const DEFAULT_FINANCE_SETTINGS = {
  invoicePrefix: '',
  invoiceCounter: 0,
  paymentMethods: [] as string[],
  arBuckets: [30, 60, 90],
  payrollApprovalRequired: false,
  lockPastMonths: false,
  fxPkrPerUsd: 280,
  lateFeesSettings: {
    enabled: true,
    type: 'percentage' as const,
    value: 5,
    gracePeriodDays: 3,
  },
};

export function parseLateFeesSettings(value: any) {
  const source = typeof value === 'object' && value ? value : {};
  const type = source.type === 'fixed' ? 'fixed' : 'percentage';
  return {
    enabled: parseBoolean(source.enabled, DEFAULT_FINANCE_SETTINGS.lateFeesSettings.enabled),
    type,
    value: Math.max(0, parseNumber(source.value, DEFAULT_FINANCE_SETTINGS.lateFeesSettings.value)),
    gracePeriodDays: Math.max(
      0,
      parseNumber(
        source.gracePeriodDays,
        DEFAULT_FINANCE_SETTINGS.lateFeesSettings.gracePeriodDays,
      ),
    ),
  };
}

export const DEFAULT_SYSTEM_SETTINGS = {
  companyName: '',
  timezone: '',
  dateFormat: '',
  workingDays: [] as string[],
  workingHours: { start: '', end: '' },
  revenueCurrency: 'USD',
  expenseCurrency: 'PKR',
  fiscalMonthStart: 1,
};

export const DEFAULT_NOTIFICATIONS_SETTINGS = {
  enableInApp: true,
  enableEmail: false,
  senderName: '',
  replyToEmail: '',
  eventToggles: {} as Record<string, boolean>,
};

export const DEFAULT_SECURITY_SETTINGS = {
  sessionTimeoutMinutes: 60,
  passwordPolicy: 'Minimum 8 characters, 1 uppercase letter, 1 number.',
  activityRetentionDays: 90,
};

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function parseNumber(value: any, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function parseString(value: any, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function parseBoolean(value: any, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

export function parseStringArray(value: any) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || '').trim()).filter((item) => item.length > 0);
}

export function parseNumberArray(value: any, fallback: number[] = []) {
  if (!Array.isArray(value)) return fallback;
  const parsed = value.map((item) => parseNumber(item, 0)).filter((item) => item > 0);
  return parsed.length ? parsed : fallback;
}

export async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  if (!isAdminRole(me.role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, user: me };
}

export function canEditSection(role: string, section: string) {
  if (isSuperAdmin(role)) return true;
  if (role.toLowerCase() === 'admin') {
    return ['system', 'workflows', 'sales', 'finance', 'notifications'].includes(section);
  }
  return false;
}

/**
 * SET-1: tenantId is REQUIRED, and the document read is the one the UI writes.
 *
 * This read `settings/workflows` — a single global document — while
 * /api/admin/settings/workflows has always SAVED to `settings/{tenantId}_workflows`. The
 * two never met. Every tenant's SLA days, at-risk threshold and overdue threshold were
 * therefore stored correctly, displayed correctly on the settings page, and then ignored
 * by every screen that computes project health: production overview and queue, AM
 * overview, pipeline and project list, and all five move-stage/assign/QA routes.
 *
 * Worse than ignored — the global document is shared, so whichever tenant last wrote it
 * (through some earlier code path) would have set thresholds for everyone.
 *
 * A blank tenantId throws rather than silently falling back to a global document, which
 * is the same fail-closed rule getUsersByRoles() already follows for recipients.
 */
export async function getWorkflowSettings(tenantId: string) {
  const scopedTenantId = String(tenantId || '').trim();
  if (!scopedTenantId) {
    throw new Error('getWorkflowSettings: tenantId is required and must be non-empty.');
  }
  const snap = await adminDb.collection('settings').doc(`${scopedTenantId}_workflows`).get();
  const data = snap.exists ? snap.data() : {};
  const slaDaysPerStage =
    typeof data?.slaDaysPerStage === 'object' && data?.slaDaysPerStage
      ? Object.fromEntries(
          Object.entries(data.slaDaysPerStage).map(([key, value]) => [key, parseNumber(value, 0)]),
        )
      : {};

  return {
    projectStages: DEFAULT_WORKFLOW_SETTINGS.projectStages,
    slaDaysPerStage: { ...DEFAULT_WORKFLOW_SETTINGS.slaDaysPerStage, ...slaDaysPerStage },
    atRiskAfterDays: parseNumber(data?.atRiskAfterDays, DEFAULT_WORKFLOW_SETTINGS.atRiskAfterDays),
    overdueAfterDays: parseNumber(
      data?.overdueAfterDays,
      DEFAULT_WORKFLOW_SETTINGS.overdueAfterDays,
    ),
    updatedAt: toISO(data?.updatedAt),
    updatedBy: data?.updatedBy || null,
  };
}

/**
 * SET-2: tenantId is REQUIRED, and there is no cross-tenant fallback.
 *
 * This was the least-broken of the three settings readers — it did check the tenant
 * document first — but its fallback was a shared global `settings/finance`. So a tenant
 * that had never opened the finance settings page inherited whatever invoice prefix,
 * AR buckets, FX rate and late-fee policy happened to be in that document, which belongs
 * to no tenant in particular. Invoice numbering and currency conversion are not things to
 * inherit from a stranger.
 *
 * A tenant with no saved settings now gets the product defaults, which is what
 * DEFAULT_FINANCE_SETTINGS is for. The optional parameter is gone for the same reason it
 * went on the other two: an omitted tenant must be a compile error, not a silent read of
 * somebody else's configuration.
 */
export async function getFinanceSettings(tenantId: string) {
  const scopedTenantId = String(tenantId || '').trim();
  if (!scopedTenantId) {
    throw new Error('getFinanceSettings: tenantId is required and must be non-empty.');
  }
  const snap = await adminDb.collection('settings').doc(`${scopedTenantId}_finance`).get();
  const data = snap.exists ? snap.data() : {};
  return {
    invoicePrefix: parseString(data?.invoicePrefix, DEFAULT_FINANCE_SETTINGS.invoicePrefix),
    invoiceCounter: parseNumber(data?.invoiceCounter, DEFAULT_FINANCE_SETTINGS.invoiceCounter),
    paymentMethods: parseStringArray(data?.paymentMethods),
    arBuckets: parseNumberArray(data?.arBuckets, DEFAULT_FINANCE_SETTINGS.arBuckets),
    payrollApprovalRequired: parseBoolean(
      data?.payrollApprovalRequired,
      DEFAULT_FINANCE_SETTINGS.payrollApprovalRequired,
    ),
    lockPastMonths: parseBoolean(data?.lockPastMonths, DEFAULT_FINANCE_SETTINGS.lockPastMonths),
    fxPkrPerUsd: parseNumber(data?.fxPkrPerUsd, DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd),
    lateFeesSettings: parseLateFeesSettings(data?.lateFeesSettings),
    updatedAt: toISO(data?.updatedAt),
    updatedBy: data?.updatedBy || null,
  };
}

/**
 * SET-1: tenantId is REQUIRED, and the document read is the one the UI writes.
 *
 * Same defect as getWorkflowSettings: this read the global `settings/notifications` while
 * /api/admin/settings/notifications saves to `settings/{tenantId}_notifications` and its
 * own GET reads the tenant document. So the settings page showed a tenant its real saved
 * preferences while the one server-side consumer applied somebody else's.
 */
export async function getNotificationSettings(tenantId: string) {
  const scopedTenantId = String(tenantId || '').trim();
  if (!scopedTenantId) {
    throw new Error('getNotificationSettings: tenantId is required and must be non-empty.');
  }
  const snap = await adminDb.collection('settings').doc(`${scopedTenantId}_notifications`).get();
  const data = snap.exists ? snap.data() : {};
  const eventToggles =
    typeof data?.eventToggles === 'object' && data?.eventToggles
      ? Object.fromEntries(
          Object.entries(data.eventToggles).map(([key, value]) => [key, Boolean(value)]),
        )
      : {};
  return {
    enableInApp: parseBoolean(data?.enableInApp, DEFAULT_NOTIFICATIONS_SETTINGS.enableInApp),
    enableEmail: parseBoolean(data?.enableEmail, DEFAULT_NOTIFICATIONS_SETTINGS.enableEmail),
    senderName: parseString(data?.senderName, DEFAULT_NOTIFICATIONS_SETTINGS.senderName),
    replyToEmail: parseString(data?.replyToEmail, DEFAULT_NOTIFICATIONS_SETTINGS.replyToEmail),
    eventToggles,
  };
}

export function computeHealth(
  dueDate: string | null,
  atRiskAfterDays: number,
  overdueAfterDays: number,
) {
  if (!dueDate) return 'On Track' as const;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'On Track' as const;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -Math.max(overdueAfterDays, 0)) return 'Overdue' as const;
  if (diffDays <= Math.max(atRiskAfterDays, 0)) return 'At Risk' as const;
  return 'On Track' as const;
}

export async function logSettingsChange({
  user,
  section,
  summary,
  notificationsEnabled,
}: {
  user: { uid: string; role: string; name?: string; email?: string; tenantId?: string };
  section: string;
  summary: string;
  notificationsEnabled?: boolean;
}) {
  await adminDb.collection('admin_activity').add({
    action: 'settings.update',
    section,
    summary,
    performedBy: user.uid,
    performedByRole: user.role,
    timestamp: new Date().toISOString(),
    tenantId: user.tenantId || DEFAULT_TENANT_ID,
  });

  await adminDb.collection('events').add({
    type: 'settings.update',
    title: `Settings updated: ${section}`,
    description: summary,
    entityType: 'settings',
    entityId: section,
    metadata: { section },
    createdByUid: user.uid,
    createdByName: user.name || user.email || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    tenantId: user.tenantId || DEFAULT_TENANT_ID,
  });

  const notifications =
    typeof notificationsEnabled === 'boolean'
      ? notificationsEnabled
      : (await getNotificationSettings(user.tenantId || DEFAULT_TENANT_ID)).enableInApp;

  if (notifications) {
    await createNotification({
      toUserId: user.uid,
      title: 'System settings updated',
      body: summary,
      type: 'system',
      entityType: null,
      entityId: section,
      createdBy: { uid: user.uid, name: user.name || user.email || null },
      tenantId: user.tenantId || DEFAULT_TENANT_ID,
    });
  }
}
