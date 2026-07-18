import * as fs from 'fs';
import * as path from 'path';

/**
 * O2 — onboarding routing contract (ONB-04, ONB-05).
 *
 * Two routing defects shipped from hard-coded `/dashboard` destinations:
 *
 *   - ONB-04: the Help Center "retake tour" button pushed every user to /dashboard, which the
 *     middleware rejects for the nine non-admin roles. Replay must instead route to the user's
 *     own role home via getRoleRoute(currentRole).
 *
 *   - ONB-05: signup handed off straight to /dashboard from both the Stripe checkout success URL
 *     and the success-screen button, skipping the verified activation sequence. Both must route
 *     to /onboarding (the existing activation checklist page).
 *
 * This is a filesystem-based guard (no server, no network) so it runs in the normal jest suite
 * and fails the build if either destination regresses back to /dashboard.
 */

const ROOT = process.cwd();
const helpCenterPath = path.join(ROOT, 'components/help-center/HelpCenterPageContent.tsx');
const signupPath = path.join(ROOT, 'app/signup/page.tsx');

const helpCenterSrc = fs.readFileSync(helpCenterPath, 'utf8');
const signupSrc = fs.readFileSync(signupPath, 'utf8');

describe('O2: onboarding routing (ONB-04, ONB-05)', () => {
  it('Help Center replay routes to the role home via getRoleRoute (ONB-04)', () => {
    expect(helpCenterSrc).toMatch(/import\s*\{\s*getRoleRoute\s*\}\s*from\s*'@\/lib\/roleRouting'/);
    expect(helpCenterSrc).toMatch(/router\.push\(getRoleRoute\(currentRole\)\)/);
    expect(helpCenterSrc).not.toMatch(/router\.push\('\/dashboard'\)/);
  });

  it('signup checkout success URL routes to /onboarding (ONB-05)', () => {
    expect(signupSrc).toMatch(
      /successUrl:\s*`\$\{window\.location\.origin\}\/onboarding\?signup=success`/,
    );
    expect(signupSrc).not.toMatch(/\/dashboard\?signup=success/);
  });

  it('signup success-screen button routes to /onboarding (ONB-05)', () => {
    expect(signupSrc).toMatch(/router\.push\('\/onboarding'\)/);
    expect(signupSrc).not.toMatch(/router\.push\('\/dashboard'\)/);
  });

  it('the /onboarding activation page exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/onboarding/page.tsx'))).toBe(true);
  });
});
