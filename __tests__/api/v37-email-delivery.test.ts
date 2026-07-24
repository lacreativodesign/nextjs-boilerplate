import fs from 'fs';
import path from 'path';

/**
 * P0-5 — no customer-blocking email may depend on a queue nothing drains.
 *
 * Two collections were written to and never read:
 *
 *   `email_events`  — written by app/api/admin/projects/create (payment confirmation,
 *                     welcome, and the account activation email carrying the client's
 *                     set-password link) and by app/api/super_admin/tenants (the new tenant
 *                     admin's activation email). Zero readers, no draining cron.
 *   `emails`        — lib/clientActivation.queueClientActivationInvite wrote the client's
 *                     set-password link here from five different call sites. The rows are
 *                     surfaced in the sales UI and health stats, but nothing sends them.
 *
 * The set-password link is the only route into the client portal, and the only way a
 * super_admin-created tenant admin ever obtains a password. Both accounts were unreachable.
 *
 * These assertions pin delivery at the call site and keep the live credential out of Firestore.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const OUTBOX = 'lib/emailEvents.ts';
const ACTIVATION = 'lib/clientActivation.ts';
const TENANTS = 'app/api/super_admin/tenants/route.ts';
const PROJECTS = 'app/api/admin/projects/create/route.ts';

describe('P0-5: email_events is a delivery record, not an undrained queue', () => {
  const src = read(OUTBOX);

  it('renders and sends inline instead of only writing a row', () => {
    expect(src).toContain("import { sendEmail } from '@/lib/email/email-service'");
    expect(src).toContain('await sendEmail({ to: recipient');
  });

  it('never records a status that implies someone else will deliver it', () => {
    expect(src).not.toContain("status: 'pending'");
    expect(src).not.toContain("status: 'queued'");
    expect(src).toContain("let status: EmailEventStatus = rendered ? 'sent' : 'unroutable';");
  });

  it('records a provider failure instead of throwing away the reason', () => {
    expect(src).toContain('} catch (sendError: unknown) {');
    expect(src).toContain("status = 'failed';");
    expect(src).toContain('error,');
  });

  it('never lets an email failure roll back the record it belongs to', () => {
    const body = src.slice(src.indexOf('export async function queueEmailEvent'));
    expect(body).not.toMatch(/throw new Error/);
  });

  it('refuses to send an activation email with no link in it', () => {
    expect(src).toContain('if (!setPasswordUrl) return null;');
  });

  it('keeps the set-password link out of Firestore', () => {
    expect(src).toContain('const { setPasswordLink: _omitted, ...safeData }');
    expect(src).toContain('data: safeData,');
  });
});

describe('P0-5: client activation actually sends the portal invite', () => {
  const src = read(ACTIVATION);

  it('sends through the same helper the admin user-creation path uses', () => {
    expect(src).toContain('sendSetPasswordEmail');
    expect(src).toContain('await sendSetPasswordEmail({');
  });

  it('no longer writes a row that claims delivery is pending', () => {
    expect(src).not.toContain("status: 'pending',");
  });

  it('records the real outcome and logs a failure', () => {
    expect(src).toContain("let status: 'sent' | 'failed' | 'unroutable' = 'unroutable';");
    expect(src).toContain('[EMAIL] Client activation email not delivered');
  });

  it('does not persist the live set-password credential', () => {
    const payload = src.slice(src.indexOf("await adminDb.collection('emails').add({"));
    expect(payload).not.toContain('setPasswordLink');
  });

  it('resolves the dashboard login URL through the canonical helper', () => {
    expect(src).toContain("const DASHBOARD_LOGIN_URL = appUrl('/login');");
    expect(src).not.toContain("'https://app.bizosto.com/login'");
  });
});

describe('P0-5: a super_admin-created tenant admin can obtain a password', () => {
  const src = read(TENANTS);

  it('mints a set-password token for the Auth user it creates', () => {
    expect(src).toContain('const setupToken = await createPasswordSetupToken({');
    expect(src).toContain('uid: authUser.uid,');
  });

  it('passes the link to the activation email', () => {
    expect(src).toContain('setPasswordLink: setupToken.link,');
  });

  it('mints the token before the email is dispatched', () => {
    expect(src.indexOf('createPasswordSetupToken({')).toBeLessThan(
      src.indexOf('queueEmailEvent({'),
    );
  });
});

describe('P0-5: no TODO reaches a customer', () => {
  it('the onboarding email no longer carries a TODO placeholder', () => {
    expect(read(PROJECTS)).not.toContain('TODO');
  });

  it('no TODO or FIXME remains in application, library or component source', () => {
    const roots = ['app', 'lib', 'components'];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.name === 'node_modules' || full.includes('__tests__')) continue;
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (/\bTODO\b|\bFIXME\b/.test(src)) offenders.push(path.relative(process.cwd(), full));
        }
      }
    };

    for (const root of roots) walk(path.join(process.cwd(), root));
    expect(offenders).toEqual([]);
  });
});
