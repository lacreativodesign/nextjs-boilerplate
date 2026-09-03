import * as fs from 'fs';
import * as path from 'path';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('payment-gated commercial activation contract', () => {
  const dealUpdate = read('app/api/admin/sales/deals/update/route.ts');
  const paymentService = read('lib/finance/clientPaymentActivation.ts');
  const invoiceActions = read('lib/finance/invoiceActions.ts');
  const payRoute = read('app/api/public/invoice/[invoiceId]/pay/route.ts');
  const confirmRoute = read('app/api/public/invoice/[invoiceId]/confirm/route.ts');
  const connectWebhook = read('app/api/stripe/connect/webhook/route.ts');
  const clientActivation = read('lib/clientActivation.ts');
  const reminderCron = read('app/api/cron/invoice-reminders/route.ts');

  it('Closed Won prepares payment but does not create a production project', () => {
    expect(dealUpdate).toContain("updates.engagementStatus = 'awaiting_payment'");
    expect(dealUpdate).toContain('projectCreated: false');
    expect(dealUpdate).not.toContain('createProjectFromDeal');
    expect(dealUpdate).not.toContain('maybeAutoCreateProjectFromInvoice');
  });

  it('Closed Won honors the tenant-configured order prefix and starting-number sequence', () => {
    expect(dealUpdate).toContain('tenantData.orderPrefix');
    expect(dealUpdate).toContain('tenantData.orderStartingNumber');
    expect(dealUpdate).toContain(".doc('invoices')");
    expect(dealUpdate).toContain('{ value: nextOrderSeq }');
    expect(dealUpdate).not.toContain('return `LC-');
    expect(dealUpdate).not.toContain(".doc('orders')");
  });

  it('labels the first installment from the actual amount due rather than closure-narrowed state', () => {
    expect(dealUpdate).toContain(
      'const isDepositPayment = closedWonPayableNow + 0.005 < closedWonAmountTotal;',
    );
    expect(dealUpdate).toContain('const paymentLabel = isDepositPayment');
    expect(dealUpdate).not.toContain("closedWonPaymentPlan === 'fifty_fifty'");
  });

  it('both public payment routes and the Connect webhook use the canonical service', () => {
    for (const source of [payRoute, confirmRoute, connectWebhook]) {
      expect(source).toContain('recordSuccessfulClientPayment');
    }
  });

  it('a partial payment is a valid project activation state', () => {
    expect(invoiceActions).toContain("['partially_paid', 'paid']");
    expect(invoiceActions).toContain('resolveTotalPaid(invoiceData) <= 0');
  });

  it('portal activation is reconciled before project creation', () => {
    const portalIndex = paymentService.indexOf('await queueClientActivationInvite({');
    const projectIndex = paymentService.indexOf('await maybeAutoCreateProjectFromInvoice({');
    expect(portalIndex).toBeGreaterThan(-1);
    expect(projectIndex).toBeGreaterThan(portalIndex);
  });

  it('portal identities receive tenant claims and fail closed on cross-tenant reuse', () => {
    expect(clientActivation).toContain('setCustomUserClaims(portalUserUid');
    expect(clientActivation).toContain("role: 'client'");
    expect(clientActivation).toContain('tenantId: scopedTenantId');
    expect(clientActivation).toContain('already linked to another Bizosto workspace');
  });

  it('Connect payments bind the signed event account to the server-owned tenant', () => {
    expect(connectWebhook).toContain('findTenantByAccountId(accountId)');
    expect(connectWebhook).toContain('tenantDoc.id !== tenantId');
    expect(connectWebhook).toContain('Connect payment tenant/account mismatch');
  });

  it('50/50 milestone balances become due through the existing reminder engine', () => {
    expect(reminderCron).toContain('activateMilestoneBalanceIfDue');
    expect(reminderCron).toContain("String(raw.balanceTriggerType || '') === 'milestone'");
    expect(reminderCron).toContain('milestoneReached(project.stage, targetStage)');
    expect(reminderCron).toContain('balanceMilestoneTriggeredAt');
  });

  it('successful payments are idempotent by provider payment id', () => {
    expect(paymentService).toContain("collection('payments').doc(paymentId)");
    expect(paymentService).toContain('if (paymentSnap.exists)');
    expect(paymentService).toContain('newlyRecorded: false');
  });
});
