import fs from 'fs';
import path from 'path';

/**
 * SOC2 F-06 — the validation ratchet.
 *
 * 329 routes under app/api mutate state and read a request body. The 235 listed below
 * hand that body onward without ever checking its shape. Converting them is long work;
 * this test exists so that the number can only fall while that work happens.
 *
 * It is an INVENTORY, not a threshold, and it enforces two rules:
 *
 *   1. A mutating route that reads a body and is NOT listed below must validate. A new
 *      route cannot be added unvalidated — the default flips to "must have a schema".
 *
 *   2. A route listed below that HAS been fixed must be deleted from the list. Fixing a
 *      route without removing its entry fails just as loudly as adding an unvalidated
 *      one, so the list cannot rot into a permanent excuse.
 *
 * A count-based threshold would satisfy neither. It would let someone convert an easy
 * route, add a hard one the same day, and call it even.
 */

const ROOT = process.cwd();

/**
 * A route is IN SCOPE when it exports a mutating handler and reads a request body.
 *
 * `.text()` is deliberately not a body read here. Its eleven call sites are all raw-body
 * signature verification (Stripe and inbound webhooks), where the bytes must stay
 * unparsed to compute an HMAC. Those routes authenticate the payload cryptographically
 * before trusting it, which is a stronger check than a schema, not a missing one.
 */
const MUTATING =
  /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b|export\s+const\s+(?:POST|PUT|PATCH|DELETE)\s*[:=]/;
const READS_BODY = /\b(?:req|request|_req|_request)\s*\.\s*(?:json|formData)\s*\(\s*\)/;

/** Evidence that the request body was checked against a schema. */
const VALIDATES =
  /\bvalidateRequest\s*\(|\bvalidatePartial\s*\(|\bsafeParse\s*\(|(?<!\bJSON)(?<!\bDate)\.parse\s*\(/;

function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, found);
    else if (entry.name === 'route.ts') found.push(path.relative(ROOT, full));
  }
  return found;
}

const inScope = routeFiles(path.join(ROOT, 'app/api'))
  .sort()
  .filter((rel) => {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return MUTATING.test(source) && READS_BODY.test(source);
  });

const validates = (rel: string) => VALIDATES.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/** Routes that read a request body and never check its shape. DELETE ONLY. */
const KNOWN_UNVALIDATED = [
  'app/api/activities/presence/route.ts',
  'app/api/activities/route.ts',
  'app/api/admin/activity/add/route.ts',
  'app/api/admin/change-requests/create/route.ts',
  'app/api/admin/change-requests/update-commercial/route.ts',
  'app/api/admin/change-requests/update-status/route.ts',
  'app/api/admin/clients/activation/route.ts',
  'app/api/admin/clients/delete/route.ts',
  'app/api/admin/clients/invite/route.ts',
  'app/api/admin/clients/segments/create/route.ts',
  'app/api/admin/clients/segments/delete/route.ts',
  'app/api/admin/clients/segments/update/route.ts',
  'app/api/admin/clients/send-invite/route.ts',
  'app/api/admin/clients/update/route.ts',
  'app/api/admin/files/create/route.ts',
  'app/api/admin/files/delete/route.ts',
  'app/api/admin/finance/budgets/route.ts',
  'app/api/admin/finance/expenses/create/route.ts',
  'app/api/admin/finance/expenses/delete/route.ts',
  'app/api/admin/finance/expenses/update/route.ts',
  'app/api/admin/finance/invoices/create/route.ts',
  'app/api/admin/finance/invoices/delete/route.ts',
  'app/api/admin/finance/invoices/update/route.ts',
  'app/api/admin/finance/payments/update/route.ts',
  'app/api/admin/finance/payroll/delete/route.ts',
  'app/api/admin/finance/payroll/run/route.ts',
  'app/api/admin/finance/payroll/update/route.ts',
  'app/api/admin/finance/tax-rates/route.ts',
  'app/api/admin/hr/documents/delete/route.ts',
  'app/api/admin/hr/documents/upload/route.ts',
  'app/api/admin/hr/employees/update/route.ts',
  'app/api/admin/hr/onboarding/assign/route.ts',
  'app/api/admin/hr/onboarding/tasks/update/route.ts',
  'app/api/admin/hr/onboarding/templates/create/route.ts',
  'app/api/admin/hr/onboarding/templates/update/route.ts',
  'app/api/admin/hr/performance/create/route.ts',
  'app/api/admin/hr/settings/route.ts',
  'app/api/admin/launch-checklist/route.ts',
  'app/api/admin/production/events/create/route.ts',
  'app/api/admin/production/project/assign/route.ts',
  'app/api/admin/production/project/move-stage/route.ts',
  'app/api/admin/projects/create/route.ts',
  'app/api/admin/projects/delete/route.ts',
  'app/api/admin/projects/move-stage/route.ts',
  'app/api/admin/projects/update/route.ts',
  'app/api/admin/quotas/route.ts',
  'app/api/admin/rate-limits/route.ts',
  'app/api/admin/reports/settings/route.ts',
  'app/api/admin/sales/campaigns/create/route.ts',
  'app/api/admin/sales/campaigns/delete/route.ts',
  'app/api/admin/sales/campaigns/update/route.ts',
  'app/api/admin/sales/deals/create/route.ts',
  'app/api/admin/sales/deals/delete/route.ts',
  'app/api/admin/sales/follow-ups/create/route.ts',
  'app/api/admin/sales/follow-ups/delete/route.ts',
  'app/api/admin/sales/follow-ups/update/route.ts',
  'app/api/admin/sales/leads/create/route.ts',
  'app/api/admin/sales/leads/delete/route.ts',
  'app/api/admin/sales/leads/update/route.ts',
  'app/api/admin/sales/pipeline/update/route.ts',
  'app/api/admin/settings/ai-workforce/route.ts',
  'app/api/admin/settings/api-key/route.ts',
  'app/api/admin/settings/email-provider/route.ts',
  'app/api/admin/settings/finance/route.ts',
  'app/api/admin/settings/integrations/route.ts',
  'app/api/admin/settings/notifications/route.ts',
  'app/api/admin/settings/sales/route.ts',
  'app/api/admin/settings/security/route.ts',
  'app/api/admin/settings/system/route.ts',
  'app/api/admin/settings/workflows/route.ts',
  'app/api/admin/sso/configure/route.ts',
  'app/api/admin/users/[uid]/update/route.ts',
  'app/api/admin/users/get/route.ts',
  'app/api/ai/agent-tasks/route.ts',
  'app/api/ai/natural-language-report/route.ts',
  'app/api/ai/tools/finance-write/route.ts',
  'app/api/ai/tools/read/route.ts',
  'app/api/ai/tools/sales-write/route.ts',
  'app/api/am/change-requests/create/route.ts',
  'app/api/am/change-requests/update-status/route.ts',
  'app/api/am/files/upload/route.ts',
  'app/api/am/messages/send/route.ts',
  'app/api/am/projects/move-stage/route.ts',
  'app/api/am/projects/request-stage-move/route.ts',
  'app/api/approvals/approve/route.ts',
  'app/api/approvals/reject/route.ts',
  'app/api/approvals/request/route.ts',
  'app/api/approvals/resolve/route.ts',
  'app/api/auth/consume-set-password-token/route.ts',
  'app/api/auth/create-set-password-token/route.ts',
  'app/api/auth/request-password-reset/route.ts',
  'app/api/auth/send-otp/route.ts',
  'app/api/auth/sso/[provider]/link/route.ts',
  'app/api/auth/verify-otp/route.ts',
  'app/api/automation/approvals/[id]/respond/route.ts',
  'app/api/automation/workflows/[id]/route.ts',
  'app/api/automation/workflows/[id]/test/route.ts',
  'app/api/automation/workflows/route.ts',
  'app/api/backup/restore/route.ts',
  'app/api/billing/address/route.ts',
  'app/api/billing/payment-method/route.ts',
  'app/api/billing/subscription/change/route.ts',
  'app/api/billing/usage/route.ts',
  'app/api/client/change-requests/comment/route.ts',
  'app/api/client/change-requests/create/route.ts',
  'app/api/client/change-requests/update-status/route.ts',
  'app/api/client/files/upload/route.ts',
  'app/api/client/invites/complete/route.ts',
  'app/api/client/profile/route.ts',
  'app/api/client/profile/update/route.ts',
  'app/api/client/projects/approve/route.ts',
  'app/api/create-user/route.ts',
  'app/api/crm/deals/[id]/discount-request/route.ts',
  'app/api/crm/deals/[id]/route.ts',
  'app/api/crm/discount-requests/[id]/review/route.ts',
  'app/api/crm/leads/convert/route.ts',
  'app/api/crm/leads/route.ts',
  'app/api/dashboard/layout/route.ts',
  'app/api/dashboard/widgets/route.ts',
  'app/api/deals/mark-paid/route.ts',
  'app/api/documents/[id]/version/route.ts',
  'app/api/documents/bulk-delete/route.ts',
  'app/api/documents/bulk-move/route.ts',
  'app/api/documents/upload/route.ts',
  'app/api/email/templates/[id]/preview/route.ts',
  'app/api/finance/budgets/delete/route.ts',
  'app/api/finance/credit-notes/create/route.ts',
  'app/api/finance/currency/convert/route.ts',
  'app/api/finance/expenses/create/route.ts',
  'app/api/finance/invoices/mark-paid/route.ts',
  'app/api/finance/invoices/update/route.ts',
  'app/api/finance/payments/record/route.ts',
  'app/api/finance/payments/update/route.ts',
  'app/api/finance/payroll/run/route.ts',
  'app/api/finance/payroll/update/route.ts',
  'app/api/finance/recurring-invoices/delete/route.ts',
  'app/api/finance/tax-rates/[taxRateId]/route.ts',
  'app/api/finance/tax-rates/delete/route.ts',
  'app/api/finance/tax-rates/route.ts',
  'app/api/finance/tax-reports/route.ts',
  'app/api/hr/documents/delete/route.ts',
  'app/api/hr/documents/upload/route.ts',
  'app/api/hr/employees/delete/route.ts',
  'app/api/hr/employees/update/route.ts',
  'app/api/hr/onboarding/assign/route.ts',
  'app/api/hr/onboarding/tasks/create/route.ts',
  'app/api/hr/onboarding/tasks/delete/route.ts',
  'app/api/hr/onboarding/tasks/update/route.ts',
  'app/api/hr/onboarding/templates/create/route.ts',
  'app/api/hr/onboarding/templates/delete/route.ts',
  'app/api/hr/onboarding/templates/update/route.ts',
  'app/api/hr/performance/create/route.ts',
  'app/api/hr/performance/update/route.ts',
  'app/api/hr/settings/route.ts',
  'app/api/import/parse/route.ts',
  'app/api/ingest/briefs/route.ts',
  'app/api/integrations/docusign/oauth/route.ts',
  'app/api/integrations/docusign/send/route.ts',
  'app/api/integrations/google/calendar/sync/route.ts',
  'app/api/integrations/google/connection/route.ts',
  'app/api/integrations/google/drive/upload/route.ts',
  'app/api/integrations/google/gmail/send/route.ts',
  'app/api/integrations/mailchimp/audiences/route.ts',
  'app/api/integrations/mailchimp/oauth/route.ts',
  'app/api/integrations/mailchimp/subscribe/route.ts',
  'app/api/integrations/mailchimp/sync/route.ts',
  'app/api/integrations/microsoft/calendar/sync/route.ts',
  'app/api/integrations/microsoft/connection/route.ts',
  'app/api/integrations/microsoft/onedrive/upload/route.ts',
  'app/api/integrations/microsoft/outlook/send/route.ts',
  'app/api/integrations/quickbooks/status/route.ts',
  'app/api/integrations/quickbooks/sync/route.ts',
  'app/api/integrations/slack/connection/route.ts',
  'app/api/integrations/slack/oauth/route.ts',
  'app/api/integrations/twilio/webhook/route.ts',
  'app/api/integrations/xero/status/route.ts',
  'app/api/integrations/xero/sync/route.ts',
  'app/api/internal/usage-log/route.ts',
  'app/api/internal/workflow-mutation/route.ts',
  'app/api/leads/convert-to-deal/route.ts',
  'app/api/notifications/create/route.ts',
  'app/api/notifications/mark-read/route.ts',
  'app/api/notifications/push-token/route.ts',
  'app/api/onboarding/progress/route.ts',
  'app/api/payments/create-intent/route.ts',
  'app/api/payments/refund/route.ts',
  'app/api/performance/targets/[targetId]/route.ts',
  'app/api/performance/targets/route.ts',
  'app/api/permissions/check/route.ts',
  'app/api/permissions/roles/[id]/route.ts',
  'app/api/production/defects/[id]/route.ts',
  'app/api/production/defects/route.ts',
  'app/api/production/files/upload/route.ts',
  'app/api/production/project/move-stage/route.ts',
  'app/api/production/project/qa/route.ts',
  'app/api/production/resources/assign/route.ts',
  'app/api/production/test-cases/route.ts',
  'app/api/production/test-runs/route.ts',
  'app/api/sales/campaigns/create/route.ts',
  'app/api/sales/campaigns/update/route.ts',
  'app/api/sales/deals/close/route.ts',
  'app/api/sales/deals/update/route.ts',
  'app/api/sales/email/send/route.ts',
  'app/api/sales/follow-ups/create/route.ts',
  'app/api/sales/follow-ups/update/route.ts',
  'app/api/sales/lead-notes/create/route.ts',
  'app/api/sales/leads/update/route.ts',
  'app/api/sales/payments/create-link/route.ts',
  'app/api/sales_manager/deals/update/route.ts',
  'app/api/sales_manager/leads/convert/route.ts',
  'app/api/sales_manager/leads/update/route.ts',
  'app/api/sales_manager/pipeline/update/route.ts',
  'app/api/session-login/route.ts',
  'app/api/stripe/checkout/route.ts',
  'app/api/super_admin/maintenance/backfill/route.ts',
  'app/api/super_admin/migration/route.ts',
  'app/api/super_admin/restore/route.ts',
  'app/api/super_admin/settings/route.ts',
  'app/api/super_admin/tenant/switch/route.ts',
  'app/api/super_admin/tenants/[tenantId]/plan/route.ts',
  'app/api/super_admin/tenants/[tenantId]/roles/route.ts',
  'app/api/super_admin/tenants/[tenantId]/route.ts',
  'app/api/super_admin/tenants/route.ts',
  'app/api/super_admin/tickets/[ticketId]/route.ts',
  'app/api/super_admin/users/[uid]/route.ts',
  'app/api/support/help-feedback/route.ts',
  'app/api/support/tickets/[id]/messages/route.ts',
  'app/api/support/tickets/route.ts',
  'app/api/zapier/actions/[action]/route.ts',
  'app/api/zapier/auth/route.ts',
  'app/api/zapier/hooks/[id]/unsubscribe/route.ts',
  'app/api/zapier/hooks/subscribe/route.ts',
  'app/api/zapier/searches/[search]/route.ts',
];

describe('the validation ratchet', () => {
  it('adds no new unvalidated route', () => {
    const listed = new Set(KNOWN_UNVALIDATED);
    const offenders = inScope.filter((rel) => !listed.has(rel) && !validates(rel));
    expect(offenders).toEqual([]);
  });

  it('drops each route from the inventory as it is fixed', () => {
    const fixed = KNOWN_UNVALIDATED.filter((rel) => fs.existsSync(path.join(ROOT, rel)))
      .filter((rel) => validates(rel))
      .map((rel) => `${rel} now validates — delete it from KNOWN_UNVALIDATED`);
    expect(fixed).toEqual([]);
  });

  it('keeps every entry pointing at a route that is still in scope', () => {
    const stale = KNOWN_UNVALIDATED.filter((rel) => !inScope.includes(rel));
    expect(stale).toEqual([]);
  });

  it('stays sorted and free of duplicates', () => {
    expect(new Set(KNOWN_UNVALIDATED).size).toBe(KNOWN_UNVALIDATED.length);
    expect(KNOWN_UNVALIDATED).toEqual([...KNOWN_UNVALIDATED].sort());
  });
});
