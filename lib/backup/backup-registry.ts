/**
 * Backup collection registry (P1-6a).
 *
 * The nightly backup cron previously backed up seven hardcoded top-level collections.
 * The application writes tenant data to ~40 more, so most business records — including the
 * append-only finance ledger — were never captured, and nothing detected the drift when a
 * new collection was added.
 *
 * This registry classifies every TOP-LEVEL collection the code references into one of four
 * buckets. The cron backs up `durable` and `audit`; it skips `ephemeral` and `subcollection`.
 * `__tests__/backup/backup-registry-coverage.test.ts` fails the build if a top-level
 * collection appears in the code that is not classified here, so coverage cannot silently
 * regress.
 *
 * Cost note: the high-volume, low-restore-value collections (activity feeds, notification
 * instances, security/CSP noise, usage and run logs) are deliberately `ephemeral`. They are
 * both the correct things to skip AND the collections that would otherwise dominate backup
 * size and Firestore read cost. Keeping the durable business + audit set — which is
 * comparatively small — is the inexpensive choice.
 */

export type BackupClass = 'durable' | 'audit' | 'ephemeral' | 'subcollection';

export type CollectionClassification = {
  class: BackupClass;
  reason: string;
};

/**
 * Every top-level collection referenced anywhere in app/ or lib/, with its class and a
 * one-line justification. Keyed by collection name.
 */
export const COLLECTION_REGISTRY: Record<string, CollectionClassification> = {
  // ---- durable: core tenant business records; losing them is data loss ----
  users: { class: 'durable', reason: 'Tenant user accounts and roles.' },
  clients: { class: 'durable', reason: 'CRM client records.' },
  customers: { class: 'durable', reason: 'Billing customer records.' },
  accounts: { class: 'durable', reason: 'CRM account records.' },
  deals: { class: 'durable', reason: 'Sales deals — pipeline revenue records.' },
  leads: { class: 'durable', reason: 'Sales leads.' },
  pipelines: { class: 'durable', reason: 'Sales pipeline definitions.' },
  campaigns: { class: 'durable', reason: 'Marketing campaign records.' },
  sales_targets: { class: 'durable', reason: 'Sales target configuration.' },
  performance_targets: { class: 'durable', reason: 'Performance target configuration.' },
  projects: { class: 'durable', reason: 'Project records.' },
  project_templates: { class: 'durable', reason: 'Reusable project templates.' },
  milestones: { class: 'durable', reason: 'Project milestones.' },
  tasks: { class: 'durable', reason: 'Task records.' },
  task_comments: { class: 'durable', reason: 'Task discussion history.' },
  briefs: { class: 'durable', reason: 'Creative/production briefs.' },
  production_jobs: { class: 'durable', reason: 'Production job records.' },
  changeRequests: { class: 'durable', reason: 'Client change requests (approval workflow).' },
  approvals: { class: 'durable', reason: 'Approval workflow records.' },
  approval_groups: { class: 'durable', reason: 'Approval group configuration.' },
  automation_workflows: { class: 'durable', reason: 'Automation workflow definitions.' },
  automation_approvals: { class: 'durable', reason: 'Automation approval records.' },
  invoices: { class: 'durable', reason: 'Invoices — core financial records.' },
  generated_invoices: { class: 'durable', reason: 'System-generated invoice records.' },
  recurring_invoice_templates: { class: 'durable', reason: 'Recurring invoice definitions.' },
  credit_notes: { class: 'durable', reason: 'Credit notes — financial records.' },
  payments: { class: 'durable', reason: 'Payment records.' },
  payment_intents: { class: 'durable', reason: 'Payment intent records.' },
  payment_refunds: { class: 'durable', reason: 'Refund records.' },
  expenses: { class: 'durable', reason: 'Expense records.' },
  budgets: { class: 'durable', reason: 'Budget definitions.' },
  budget_actuals: { class: 'durable', reason: 'Budget actuals.' },
  purchase_orders: { class: 'durable', reason: 'Purchase orders.' },
  suppliers: { class: 'durable', reason: 'Supplier records.' },
  products: { class: 'durable', reason: 'Product catalogue.' },
  warehouses: { class: 'durable', reason: 'Warehouse definitions.' },
  stock_locations: { class: 'durable', reason: 'Inventory locations.' },
  stock_adjustments: { class: 'durable', reason: 'Inventory adjustment history.' },
  tax_rates: { class: 'durable', reason: 'Tax rate configuration.' },
  tax_exemptions: { class: 'durable', reason: 'Tax exemption records.' },
  tax_reports: { class: 'durable', reason: 'Generated tax reports.' },
  orders: { class: 'durable', reason: 'Order records.' },
  documents: { class: 'durable', reason: 'Document metadata.' },
  files: { class: 'durable', reason: 'File metadata.' },
  erp_files: { class: 'durable', reason: 'Managed file metadata (storage quota source).' },
  folders: { class: 'durable', reason: 'File/folder structure.' },
  employees: { class: 'durable', reason: 'Employee records.' },
  hr_employees: { class: 'durable', reason: 'HR employee records.' },
  payroll: { class: 'durable', reason: 'Payroll records.' },
  attendance: { class: 'durable', reason: 'Attendance records.' },
  attendance_logs: { class: 'durable', reason: 'Attendance detail log.' },
  time_entries: { class: 'durable', reason: 'Time tracking entries.' },
  hr_time_entries: { class: 'durable', reason: 'HR time entries.' },
  hr_timesheets: { class: 'durable', reason: 'HR timesheets.' },
  hr_tasks: { class: 'durable', reason: 'HR task records.' },
  leave_requests: { class: 'durable', reason: 'Leave requests.' },
  hr_leave_requests: { class: 'durable', reason: 'HR leave requests.' },
  hr_leave_policies: { class: 'durable', reason: 'Leave policy configuration.' },
  hr_leave_balances: { class: 'durable', reason: 'Leave balance records.' },
  hr_leave_accrual_history: { class: 'durable', reason: 'Leave accrual history.' },
  teams: { class: 'durable', reason: 'Team definitions.' },
  customer_notes: { class: 'durable', reason: 'Customer notes.' },
  saved_searches: { class: 'durable', reason: 'User saved searches.' },
  settings: { class: 'durable', reason: 'Tenant settings.' },
  tenants: { class: 'durable', reason: 'Tenant records — the root of everything.' },
  tenant_domain_mappings: { class: 'durable', reason: 'Custom domain mappings.' },
  tenant_quotas: { class: 'durable', reason: 'Per-tenant quota configuration.' },
  billing_subscriptions: { class: 'durable', reason: 'Subscription state.' },
  billing_payment_methods: { class: 'durable', reason: 'Stored payment method references.' },
  integrations: { class: 'durable', reason: 'Third-party integration configuration.' },
  webhook_subscriptions: { class: 'durable', reason: 'Outbound webhook subscriptions.' },
  notification_webhooks: { class: 'durable', reason: 'Notification webhook configuration.' },
  notification_preferences: { class: 'durable', reason: 'User notification preferences.' },
  notification_templates: { class: 'durable', reason: 'Notification templates.' },
  email_templates: { class: 'durable', reason: 'Email templates.' },
  email_template_versions: { class: 'durable', reason: 'Email template version history.' },
  permission_roles: { class: 'durable', reason: 'Custom RBAC role definitions.' },
  permission_role_assignments: { class: 'durable', reason: 'RBAC role assignments.' },
  report_schedules: { class: 'durable', reason: 'Scheduled report definitions.' },
  report_snapshots: { class: 'durable', reason: 'Point-in-time report snapshots.' },
  reports: { class: 'durable', reason: 'Saved report definitions and results.' },
  user_invitations: { class: 'durable', reason: 'Pending user invitations.' },
  user_profiles: { class: 'durable', reason: 'Extended user profile data.' },
  onboarding_progress: { class: 'durable', reason: 'Per-tenant onboarding state.' },
  rate_limit_rules: {
    class: 'durable',
    reason: 'Admin-configured rate limit rules (config, not counters).',
  },
  exchange_rate_history: {
    class: 'durable',
    reason: 'FX rates used to convert past invoices; needed to reproduce historical amounts.',
  },
  events: { class: 'durable', reason: 'Domain event stream referenced by finance/sales flows.' },
  support_tickets: { class: 'durable', reason: 'Support ticket records.' },
  platform_tickets: {
    class: 'durable',
    reason: 'Platform-wide bug/support tickets (top-level, keyed by tenantId field).',
  },
  help_feedback: {
    class: 'ephemeral',
    reason: 'Help-center helpfulness votes and ticket-deflection signals; derived telemetry.',
  },

  // ---- audit: append-only compliance / forensic records ----
  finance_ledger: {
    class: 'audit',
    reason: 'Append-only money ledger — the financial source of truth.',
  },
  auditLogs: { class: 'audit', reason: 'Privileged-action audit trail.' },
  audit_trail: { class: 'audit', reason: 'Secondary audit trail.' },
  admin_activity: { class: 'audit', reason: 'Admin action log (forensic).' },
  billing_state_audit: { class: 'audit', reason: 'Billing state transition audit.' },
  restore_audit: { class: 'audit', reason: 'Backup-restore audit trail.' },
  security_events: { class: 'audit', reason: 'Security event log (forensic).' },

  // ---- ephemeral: caches, queues, nonces, high-volume noise, regenerable ----
  sessions: { class: 'ephemeral', reason: 'Session state; regenerated on login.' },
  email_otps: { class: 'ephemeral', reason: 'Short-lived one-time passcodes.' },
  otp_rate_limits: { class: 'ephemeral', reason: 'Rate-limit counters.' },
  throttle_exceptions: { class: 'ephemeral', reason: 'Transient throttle overrides.' },
  report_cache: { class: 'ephemeral', reason: 'Regenerable report cache.' },
  report_executions: { class: 'ephemeral', reason: 'Report run logs; regenerable.' },
  email_queue: { class: 'ephemeral', reason: 'Transient outbound send queue.' },
  scheduled_emails: { class: 'ephemeral', reason: 'Transient scheduled-send state.' },
  email_events: { class: 'ephemeral', reason: 'Email delivery event log.' },
  emails: { class: 'ephemeral', reason: 'Email delivery records.' },
  email_template_usage: { class: 'ephemeral', reason: 'Derived template usage stats.' },
  dead_letter_backups: { class: 'ephemeral', reason: 'Operational dead-letter queue.' },
  dead_letter_notifications: { class: 'ephemeral', reason: 'Operational dead-letter queue.' },
  dead_letter_webhooks: { class: 'ephemeral', reason: 'Operational dead-letter queue.' },
  stripe_connect_oauth_states: { class: 'ephemeral', reason: 'Single-use OAuth nonces.' },
  stripe_connect_states: { class: 'ephemeral', reason: 'Single-use OAuth nonces.' },
  abandoned_signup_deletions: { class: 'ephemeral', reason: 'Transient signup-cleanup state.' },
  abandoned_signup_reminders: { class: 'ephemeral', reason: 'Transient signup-reminder state.' },
  activities: { class: 'ephemeral', reason: 'High-volume activity feed; regenerable/loggy.' },
  activity: { class: 'ephemeral', reason: 'High-volume activity feed; regenerable/loggy.' },
  activity_feed: { class: 'ephemeral', reason: 'High-volume activity feed; regenerable/loggy.' },
  activity_logs: { class: 'ephemeral', reason: 'High-volume activity log.' },
  activity_read_states: { class: 'ephemeral', reason: 'Per-user read markers; regenerable.' },
  user_activity: { class: 'ephemeral', reason: 'High-volume user activity log.' },
  notifications: {
    class: 'ephemeral',
    reason: 'High-volume notification instances; templates/preferences are durable.',
  },
  automation_workflow_runs: {
    class: 'ephemeral',
    reason: 'High-volume workflow execution log.',
  },
  api_usage_logs: { class: 'ephemeral', reason: 'High-volume API usage log.' },
  api_deprecation_notifications: { class: 'ephemeral', reason: 'Transient deprecation notices.' },
  csp_violations: { class: 'ephemeral', reason: 'High-volume CSP report noise.' },
  logs: { class: 'ephemeral', reason: 'Generic application logs.' },
  agent_tasks: { class: 'ephemeral', reason: 'AI agent task queue; transient work items.' },
  report_cache_meta: { class: 'ephemeral', reason: 'Cache metadata.' },
  comments: {
    class: 'ephemeral',
    reason: 'Only ever written as a subcollection; no top-level docs.',
  },
  backups: { class: 'ephemeral', reason: 'Backup run metadata; backing up backups is circular.' },
  restore_jobs: { class: 'ephemeral', reason: 'Transient restore job state.' },
  system: { class: 'ephemeral', reason: 'System/platform state; not tenant business data.' },
  system_health: { class: 'ephemeral', reason: 'Health snapshots; regenerable.' },
  tenant_stats: { class: 'ephemeral', reason: 'Derived per-tenant statistics.' },
  support_meta: { class: 'ephemeral', reason: 'Derived support metadata.' },
  counters_meta: { class: 'ephemeral', reason: 'Counter metadata.' },

  // ---- subcollection: reached only under a parent document, never at the root ----
  counters: {
    class: 'subcollection',
    reason: 'Lives under tenants/{id}/counters — not a top-level collection.',
  },
  messages: {
    class: 'subcollection',
    reason: 'Lives under projects/{id}/messages — not a top-level collection.',
  },
  _: {
    class: 'subcollection',
    reason:
      "Not a collection: collection('_').doc().id is used only to mint an ID in demo seeding; nothing is persisted.",
  },
};

/** Collections whose documents are captured by the nightly backup. */
export const BACKED_UP_CLASSES: readonly BackupClass[] = ['durable', 'audit'];

/** The sorted list of top-level collection names the backup cron must read. */
export function getBackupCollections(): string[] {
  return Object.entries(COLLECTION_REGISTRY)
    .filter(([, entry]) => (BACKED_UP_CLASSES as readonly string[]).includes(entry.class))
    .map(([name]) => name)
    .sort();
}

/** True when a collection is classified in the registry. */
export function isClassified(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(COLLECTION_REGISTRY, name);
}
