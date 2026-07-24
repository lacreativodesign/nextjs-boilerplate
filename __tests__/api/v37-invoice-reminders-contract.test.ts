import fs from 'fs';
import path from 'path';

/**
 * P0-4a — the invoice reminder cron reads the collection the product actually writes.
 *
 * The job iterated `tenants/{id}/invoices` and `tenants/{id}/clients`. A repo-wide search
 * shows nothing writes to either: invoices are created at top-level `invoices`
 * (app/api/admin/finance/invoices/create), clients at top-level `clients`. Every reminder,
 * overdue transition and late fee this job was supposed to perform has been a no-op.
 *
 * These are source-contract assertions in the style of the other v37 guards: they pin the
 * data model, the ledger integrity of the late fee, and the pagination budget.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const CRON = 'app/api/cron/invoice-reminders/route.ts';

describe('P0-4a: the cron reads the canonical invoice model', () => {
  const src = read(CRON);

  it('no longer reads the invoice subcollection nothing writes to', () => {
    expect(src).not.toMatch(
      /\.collection\(['"]tenants['"]\)[\s\S]{0,80}\.collection\(['"]invoices['"]\)/,
    );
    expect(src).not.toMatch(
      /\.collection\(['"]tenants['"]\)[\s\S]{0,80}\.collection\(['"]clients['"]\)/,
    );
  });

  it('queries top-level invoices scoped by isDeleted and canonical status', () => {
    expect(src).toContain("adminDb\n      .collection('invoices')");
    expect(src).toContain("where('isDeleted', '==', false)");
    expect(src).toContain("where('status', 'in', [...REMINDABLE_STATUSES])");
  });

  it('resolves clients from the top-level collection with a tenant check', () => {
    expect(src).toContain("adminDb.collection('clients').doc(clientId)");
    expect(src).toContain("String(data.tenantId || '') === tenantId");
  });

  it('uses canonical field names, not the old invented ones', () => {
    expect(src).toContain('orderId');
    expect(src).toContain('amountTotal');
    expect(src).toContain('balanceDue');
    expect(src).not.toContain('invoiceNumber');
    expect(src).not.toMatch(/invoice\.total\b/);
  });
});

describe('P0-4a: overdue never corrupts the canonical status field', () => {
  const src = read(CRON);

  it('does not write status: overdue', () => {
    expect(src).not.toMatch(/status:\s*['"]overdue['"]/);
  });

  it('records overdue as derived metadata instead', () => {
    expect(src).toContain('overdueSince');
  });
});

describe('P0-4a: late fees are audited and off by default', () => {
  const src = read(CRON);

  it('is gated behind an explicit environment flag', () => {
    expect(src).toContain("process.env.ERP_ENABLE_INVOICE_LATE_FEES === 'true'");
    expect(src).toContain('if (LATE_FEES_ENABLED) {');
  });

  it('mutates the invoice inside the audited finance transaction', () => {
    expect(src).toContain('mutateFinanceInTransaction');
    expect(src).toContain("type: 'adjustment.created'");
    expect(src.indexOf('mutateFinanceInTransaction')).toBeLessThan(src.indexOf('tx.update(ref, {'));
  });

  it('re-checks paid, void and already-charged state inside the transaction', () => {
    const body = src.slice(src.indexOf('async function applyLateFee'));
    expect(body).toContain('if (current.lateFeeApplied) return;');
    expect(body).toContain('Number(current.balanceDue ?? 0) <= 0');
    expect(body).toContain('REMINDABLE_STATUSES as readonly string[]');
  });

  it('adjusts balanceDue alongside amountTotal so the two cannot diverge', () => {
    const body = src.slice(src.indexOf('async function applyLateFee'));
    expect(body).toContain('amountTotal: Number((amountTotal + fee).toFixed(2))');
    expect(body).toContain('balanceDue: Number((balanceDue + fee).toFixed(2))');
  });
});

describe('P0-4a: the job is bounded and resumable', () => {
  const src = read(CRON);

  it('paginates instead of loading every invoice of every tenant at once', () => {
    expect(src).toContain('PAGE_SIZE');
    expect(src).toContain('startAfter(cursor)');
    expect(src).toContain('orderBy(admin.firestore.FieldPath.documentId())');
  });

  it('has a hard document budget and reports when it is hit', () => {
    expect(src).toContain('MAX_INVOICES_PER_RUN');
    expect(src).toContain('results.truncated = true;');
  });

  it('caches tenant and client reads rather than refetching per invoice', () => {
    expect(src).toContain('tenantCache');
    expect(src).toContain('clientCache');
  });
});

describe('P0-4a: the reminder email links to a route that exists', () => {
  const src = read(CRON);

  it('no longer links to the non-existent client invoice path', () => {
    expect(src).not.toContain('/client/invoices/');
  });

  it('links to the payable page with the per-invoice token', () => {
    expect(src).toContain('/pay/${invoice.id}?token=');
    expect(fs.existsSync(path.join(process.cwd(), 'app/pay/[invoiceId]/page.tsx'))).toBe(true);
  });

  it('quotes the outstanding balance, not the original total', () => {
    expect(src).toContain('balanceDue.toFixed(2)');
  });
});

describe('P0-4a: the route file exports only handlers and segment config', () => {
  it('exports nothing else', () => {
    const exports = read(CRON)
      .split('\n')
      .filter((line) => line.startsWith('export '))
      .map((line) => line.trim());
    expect(exports).toEqual([
      "export const runtime = 'nodejs';",
      'export async function GET(request: NextRequest) {',
    ]);
  });
});
