import fs from 'fs';
import path from 'path';
import {
  PLATFORM_BRAND,
  tenantBrand,
  invoiceEmailHtml,
  welcomeEmailHtml,
} from '@/lib/email/html-templates';

/**
 * MAIL-8 — the body of a tenant's message carries the tenant, not Bizosto.
 *
 * MAIL-3, MAIL-4 and MAIL-6 fixed the envelope: the From address, the display name, the
 * Reply-To, and eventually the sending account itself. The BODY was never touched. So an
 * invoice a tenant sent to its own customer still rendered a "BIZOSTO / Business
 * Management Platform" header block, said "Invoice from Bizosto", closed with "This
 * invoice was sent via Bizosto", and carried a footer linking to bizosto.com and
 * bizosto.com/support.
 *
 * Four announcements of a company the recipient has never heard of, on a document asking
 * them for money. For an Enterprise tenant paying for white-label that is exactly what
 * they are paying to avoid; for everyone else it makes a legitimate invoice look like it
 * came from the wrong party, which is the last impression a payment request should give.
 *
 * The direction that matters most here is the one NOT to over-apply. Most templates in
 * this file are Bizosto speaking — the welcome email, trial reminders, password reset — and
 * they must keep saying Bizosto. A password reset branded as somebody else is a phishing
 * lesson. So the default stays Bizosto, and only mail addressed to a tenant's own customer
 * overrides it.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose naming Bizosto is not read as rendering it. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const TEMPLATES = 'lib/email/html-templates.ts';
const INVOICES = 'app/api/cron/generate-invoices/route.ts';
const AI_REMINDER = 'app/api/ai/tools/finance-write/route.ts';

/**
 * The pay link is deliberately a neutral host here.
 *
 * In production it is app.bizosto.com, and that is fine — a link to the page where the
 * invoice is actually paid is functional, not branding. Using it in the fixture would make
 * the "no Bizosto anywhere" assertions match the URL rather than the copy they exist to
 * check, so the fixture keeps them separable.
 */
const SAMPLE_INVOICE = {
  clientName: 'Ana',
  invoiceNumber: 'INV-1001',
  amount: 1200,
  currency: 'USD',
  dueDate: '2026-09-01',
  viewUrl: 'https://pay.example.com/abc',
};

describe('MAIL-8: a tenant invoice never mentions Bizosto', () => {
  const html = invoiceEmailHtml(SAMPLE_INVOICE, tenantBrand('Website Design Dogs'));

  it('names the tenant in the header', () => {
    expect(html).toContain('WEBSITE DESIGN DOGS');
  });

  it('says the invoice is from the tenant', () => {
    expect(html).toContain('Invoice from WEBSITE DESIGN DOGS');
  });

  it('mentions Bizosto nowhere at all', () => {
    // The whole point. One mention is a white-label leak.
    expect(html).not.toMatch(/bizosto/i);
  });

  it('links to no Bizosto marketing or support page', () => {
    // A customer chasing an invoice must not be sent to bizosto.com/support, which knows
    // nothing about their order and discloses the tenant's supplier at the worst moment.
    // The pay link itself is exempt: it is where the invoice is settled, not branding.
    expect(html).not.toContain('https://bizosto.com');
    expect(html).not.toContain('/support');
  });

  it('points questions back at the tenant instead', () => {
    expect(html).toContain('reply to this email');
  });

  it('uses the tenant initial in the logo tile', () => {
    expect(tenantBrand('Website Design Dogs').initial).toBe('W');
  });

  it('degrades to something neutral rather than blank for an unnamed tenant', () => {
    const brand = tenantBrand('');
    expect(brand.name).toBe('YOUR SUPPLIER');
    expect(brand.initial).toBe('Y');
    expect(invoiceEmailHtml(SAMPLE_INVOICE, brand)).not.toMatch(/bizosto/i);
  });
});

describe('MAIL-8: platform mail still says Bizosto', () => {
  it('keeps the platform brand as the default', () => {
    // Every existing caller passes no brand and must be unaffected.
    expect(PLATFORM_BRAND.name).toBe('BIZOSTO');
    expect(PLATFORM_BRAND.showPlatformLinks).toBe(true);
    expect(invoiceEmailHtml(SAMPLE_INVOICE)).toContain('BIZOSTO');
  });

  it('a welcome email is Bizosto speaking and stays that way', () => {
    // Rebranding a platform message as a tenant would be a phishing lesson.
    const html = welcomeEmailHtml({
      name: 'Ana',
      companyName: 'Acme',
      loginUrl: 'https://app.bizosto.com',
    });
    expect(html).toContain('BIZOSTO');
    expect(html).toContain('https://bizosto.com');
  });

  it('keeps the support links only for platform mail', () => {
    expect(tenantBrand('Acme').showPlatformLinks).toBe(false);
  });
});

describe('MAIL-8: the customer-facing senders pass a tenant brand', () => {
  it('the recurring invoice cron brands the body', () => {
    const src = active(INVOICES);
    expect(src).toContain('invoiceEmailHtml(invoiceData, tenantBrand(');
  });

  it('the AI payment reminder brands its own header block', () => {
    const src = active(AI_REMINDER);
    expect(src).toContain('tenantBrand(');
    expect(src).toContain('${senderBrand.name}');
    expect(src).toContain('${senderBrand.initial}');
  });

  it('the AI reminder hard-codes Bizosto nowhere in its markup', () => {
    // It rendered a literal "B / Bizosto" tile to the tenant's customer.
    const src = active(AI_REMINDER);
    const htmlBlock = src.slice(src.indexOf('html: `'));
    expect(htmlBlock).not.toMatch(/bizosto/i);
  });

  it('reads the tenant name from the tenant record, not the invoice', () => {
    // An invoice carries client-supplied fields; who is sending is not negotiable per
    // message.
    expect(active(AI_REMINDER)).toContain("collection('tenants')");
  });
});

describe('MAIL-8: the shell is brand-driven rather than hard-coded', () => {
  const src = active(TEMPLATES);

  it('takes a brand with a platform default', () => {
    expect(src).toMatch(/function shell\(body: string, brand: EmailBrand = PLATFORM_BRAND\)/);
  });

  it('drives the title, tile, name and footer from it', () => {
    expect(src).toContain('<title>${brand.name}</title>');
    expect(src).toContain('${brand.initial}');
    expect(src).toContain('${brand.name}</div>');
    expect(src).toContain('${footer}');
  });

  it('omits the tagline entirely when a brand has none', () => {
    // A tenant has no "Business Management Platform" strapline, and an empty div would
    // leave a visible gap in the header.
    expect(src).toContain('${brand.tagline ?');
  });
});
