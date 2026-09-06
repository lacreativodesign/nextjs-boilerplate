import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';

const BASE_URL = String(process.env.BASE_URL || '').replace(/\/$/, '');
const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

async function getJson(page: Page, path: string): Promise<any> {
  const response: APIResponse = await page.request.get(`${BASE_URL}${path}`, {
    headers: XHR,
    failOnStatusCode: false,
  });
  expect(response.status(), `${path} should return 200`).toBe(200);
  const body = await response.json();
  expect(body?.ok, `${path} should return ok=true`).toBe(true);
  return body;
}

test.describe('Golden tenant — integrated launch journey', () => {
  test.beforeAll(() => {
    expect(BASE_URL, 'BASE_URL must be configured for deployment E2E').not.toBe('');
  });

  test('admin sees seeded revenue and delivery state across the full tenant', async ({ page }) => {
    await loginAs(page, 'admin');

    const leads = await getJson(page, '/api/crm/leads');
    const deals = await getJson(page, '/api/crm/deals');
    const invoices = await getJson(page, '/api/finance/invoices/list');
    const projects = await getJson(page, '/api/admin/projects/list');
    const clients = await getJson(page, '/api/admin/clients/list');

    expect(leads.leads.length, 'golden tenant should contain leads').toBeGreaterThan(0);
    expect(deals.deals.length, 'golden tenant should contain deals').toBeGreaterThan(0);
    expect(invoices.invoices.length, 'golden tenant should contain invoices').toBeGreaterThan(0);
    expect(projects.projects.length, 'golden tenant should contain projects').toBeGreaterThan(0);
    expect(clients.clients.length, 'golden tenant should contain clients').toBeGreaterThan(0);

    expect(leads.leads.some((lead: any) => lead.company === 'Apex Digital')).toBe(true);
    expect(deals.deals.some((deal: any) => String(deal.title || '').includes('TechVision'))).toBe(
      true,
    );
    expect(invoices.invoices.some((invoice: any) => invoice.orderId === 'INV-0001')).toBe(true);
    expect(
      projects.projects.some((project: any) => project.projectName === 'TechVision Brand Refresh'),
    ).toBe(true);
    expect(clients.clients.some((client: any) => client.companyName === 'TechVision Inc')).toBe(
      true,
    );
  });

  test('client sees its delivery artifacts but cannot enter internal finance', async ({ page }) => {
    await loginAs(page, 'client');

    const overview = await getJson(page, '/api/client/overview');
    const projects = await getJson(page, '/api/client/projects/list');

    expect(
      overview.kpis.activeProjects,
      'client should have an active golden project',
    ).toBeGreaterThan(0);
    expect(
      projects.projects.length,
      'client should see at least one linked project',
    ).toBeGreaterThan(0);
    expect(
      projects.projects.some((project: any) => project.projectName === 'TechVision Brand Refresh'),
    ).toBe(true);

    const finance = await page.request.get(`${BASE_URL}/api/finance/invoices/list`, {
      headers: XHR,
      failOnStatusCode: false,
    });
    expect([401, 403], 'client must be denied internal finance').toContain(finance.status());
  });

  test('finance can read invoices but cannot cross into admin client management', async ({
    page,
  }) => {
    await loginAs(page, 'finance');

    const invoices = await getJson(page, '/api/finance/invoices/list');
    expect(invoices.invoices.length).toBeGreaterThan(0);

    const clients = await page.request.get(`${BASE_URL}/api/admin/clients/list`, {
      headers: XHR,
      failOnStatusCode: false,
    });
    expect([401, 403], 'finance must not gain admin client access').toContain(clients.status());
  });
});
