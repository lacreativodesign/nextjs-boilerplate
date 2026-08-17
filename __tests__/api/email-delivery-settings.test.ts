import fs from 'fs';
import path from 'path';

/**
 * MAIL-7 — the tenant provider layer is reachable from the product.
 *
 * MAIL-6 built encrypted credential storage, resolution at send time, and routing through
 * a tenant's own account — then shipped with no way for a tenant to reach any of it. The
 * API existed and nothing could call it.
 *
 * That is the same shape as the attendance module, which sat in the sidebar for months
 * showing an empty grid because it had readers and no writer. The lesson from those three
 * sessions is that a feature nobody can operate is indistinguishable from a broken one, so
 * this guard pins the writer alongside the storage.
 *
 * The other half is what the screen must NOT do. The credential is write-only by design:
 * encrypted before storage, returned by no endpoint. A settings page that tried to
 * pre-fill it, echo it back, or offer to reveal it would quietly undo that, so the
 * assertions below are as much about absence as presence.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE = 'app/admin/settings/email-delivery/page.tsx';
const LAYOUT = 'app/admin/settings/layout.tsx';
const ROUTE = 'app/api/admin/settings/email-provider/route.ts';

describe('MAIL-7: a tenant can actually reach the provider settings', () => {
  it('the page exists', () => {
    expect(fs.existsSync(path.join(ROOT, PAGE))).toBe(true);
  });

  it('is registered in the settings navigation', () => {
    // Without this the page is only reachable by typing the URL, which is the same as not
    // existing for every tenant who does not know it is there.
    const layout = read(LAYOUT);
    expect(layout).toContain("path: '/admin/settings/email-delivery'");
    expect(layout).toContain("label: 'Email Delivery'");
  });

  it('calls all three verbs the API exposes', () => {
    const page = read(PAGE);
    expect(page).toContain("apiFetch('/api/admin/settings/email-provider')");
    expect(page).toMatch(/method: 'POST'/);
    expect(page).toMatch(/method: 'DELETE'/);
  });

  it('sits behind the admin-only settings layout', () => {
    // A provider credential is not something every role should be able to replace.
    expect(read(LAYOUT)).toContain("allowed={['admin', 'super_admin']}");
  });
});

describe('MAIL-7: the screen never handles the credential as readable', () => {
  const page = read(PAGE);

  it('masks the field while it is being typed', () => {
    expect(page).toContain('type="password"');
  });

  it('clears the field once the key has been sent', () => {
    // The key is never coming back, so leaving it in a form field only creates somewhere
    // for it to be read over a shoulder.
    expect(page).toContain("setApiKey('')");
  });

  it('never pre-fills the field from the server', () => {
    // The API returns no credential; a page that tried to hydrate one would be reaching
    // for a field that does not exist, or worse, one that someone later added.
    expect(page).not.toMatch(/setApiKey\(\s*(data|status)/);
    expect(page).not.toContain('apiKeyEnc');
  });

  it('shows only the masked hint', () => {
    expect(page).toContain('status.maskedKey');
  });

  it('disables the browser autofilling a secret into it', () => {
    expect(page).toContain('autoComplete="off"');
  });

  it('will not submit something too short to be a real key', () => {
    // Mirrors the server check, so an obvious mistake is caught before a round trip.
    expect(page).toContain('apiKey.trim().length < 16');
  });
});

describe('MAIL-7: the screen tells the truth about consequences', () => {
  const page = read(PAGE);

  it('says the key cannot be shown again', () => {
    expect(page).toContain('never shown again');
  });

  it('says disconnecting falls back rather than stopping mail', () => {
    // A tenant deciding whether to disconnect needs to know their invoices keep going out.
    expect(page).toContain('reverts to Bizosto');
  });

  it('is honest that SES is stored but not yet sending', () => {
    // Letting a tenant believe SES is live would be worse than not offering it.
    // Whitespace-collapsed: prettier reflows JSX prose across lines, so matching the
    // wrapping rather than the words would break on the next format run.
    const prose = page.replace(/\s+/g, ' ');
    expect(prose).toContain('stored but not yet used for sending');
  });

  it('explains what connecting actually buys them', () => {
    expect(page).toMatch(/reputation/i);
  });
});

describe('MAIL-7: the API it drives is unchanged and still write-only', () => {
  const route = read(ROUTE);

  it('returns no credential to this page', () => {
    expect(route).not.toContain('apiKeyEnc');
  });

  it('still takes the tenant from the session', () => {
    expect(route).toContain('auth.user.tenantId');
    expect(route).not.toMatch(/body\??\.\s*tenantId/);
  });
});
