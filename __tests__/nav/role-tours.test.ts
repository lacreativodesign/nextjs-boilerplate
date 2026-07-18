import * as fs from 'fs';
import * as path from 'path';
import { ERP_ROLES } from '@/lib/erpAccess';

/**
 * O3 — role-specific first-login tours (ONB-01).
 *
 * The first-login tour used to mount only inside the admin dashboard page, and its steps targeted
 * dashboard-only DOM (#sidebar-dashboard, #ai-summary-widget) that no other role home renders. As a
 * result nine of the eleven roles never saw an onboarding tour. This session makes the steps
 * role-aware (getTourSteps(role), targeting only the universal sidebar), mounts the tour once
 * globally in AppShell via PlatformTourGate (gated on each user's own role home), and removes the
 * dashboard-only mount so there is a single global mount.
 *
 * These are filesystem guards (no server, no network) so they run in the normal jest suite and fail
 * the build if any part of the contract regresses.
 */

const ROOT = process.cwd();

const appShellSrc = fs.readFileSync(path.join(ROOT, 'components/layout/AppShell.tsx'), 'utf8');
const gateSrc = fs.readFileSync(
  path.join(ROOT, 'components/onboarding/PlatformTourGate.tsx'),
  'utf8',
);
const tourSrc = fs.readFileSync(path.join(ROOT, 'components/onboarding/PlatformTour.tsx'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(ROOT, 'app/dashboard/page.tsx'), 'utf8');

describe('O3: role-specific first-login tours (ONB-01)', () => {
  it('mounts the tour once globally in AppShell via PlatformTourGate', () => {
    expect(appShellSrc).toMatch(
      /import\s*\{\s*PlatformTourGate\s*\}\s*from\s*'@\/components\/onboarding\/PlatformTourGate'/,
    );
    expect(appShellSrc).toMatch(/<PlatformTourGate\s+role=\{currentUser\.role\}/);
  });

  it('gates the tour on the user own role home', () => {
    expect(gateSrc).toMatch(/usePathname/);
    expect(gateSrc).toMatch(/getRoleRoute\(role\)/);
    expect(gateSrc).toMatch(/pathname === getRoleRoute\(role\)/);
  });

  it('tailors the tour copy per role and targets only the universal sidebar', () => {
    expect(tourSrc).toMatch(/function getTourSteps\(/);
    // Every ERP role has a tailored focus line.
    for (const role of ERP_ROLES) {
      expect(tourSrc).toMatch(new RegExp(`\\b${role}:`));
    }
    // Steps only reference the shared sidebar, never the removed dashboard-only DOM.
    expect(tourSrc).toContain('#main-sidebar');
    expect(tourSrc).not.toContain('#sidebar-dashboard');
    expect(tourSrc).not.toContain('#ai-summary-widget');
  });

  it('removes the dashboard-only tour mount', () => {
    expect(dashboardSrc).not.toMatch(/from\s*'@\/components\/onboarding\/PlatformTour'/);
    expect(dashboardSrc).not.toMatch(/<PlatformTour(?![A-Za-z])/);
  });

  it('renders PlatformTour in exactly one place (single global mount)', () => {
    const roots = ['components', 'app'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(t|j)sx?$/.test(entry.name)) files.push(full);
      }
    };
    roots.forEach((r) => walk(path.join(ROOT, r)));

    const mounts = files.filter((f) =>
      /<PlatformTour(?![A-Za-z])/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(mounts).toEqual([path.join(ROOT, 'components/onboarding/PlatformTourGate.tsx')]);
  });
});
