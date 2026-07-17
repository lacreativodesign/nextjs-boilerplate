import * as fs from 'fs';
import * as path from 'path';
import { ERP_ROLES } from '@/lib/erpAccess';

/**
 * F4 — the real notification inbox is mounted on the header bell and reachable by every role (NOT-02).
 *
 * The header bell previously mounted only the activity feed; the real NotificationBell — unread
 * badge, dropdown, mark-read and mark-all-read — lived in an unused footer component. This session
 * mounts NotificationBell in the header via AppShell, adds a "View all notifications" link at the
 * foot of the dropdown that routes to a role-neutral /notifications inbox and closes the dropdown,
 * and guards that inbox for all eleven roles (the old /dashboard/notifications was admin-only and
 * lived under the admin-owned prefix, so the other nine roles were bounced).
 *
 * This test pins three facts and fails the build if any regresses:
 *   1. AppShell mounts NotificationBell into the header's notificationBell slot.
 *   2. The dropdown links "View all notifications" to /notifications and closes on click.
 *   3. The /notifications layout's RequireAuth allow-list is the full ERP role set.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('F4: notification inbox on the header bell (NOT-02)', () => {
  it('mounts NotificationBell into the header notificationBell slot via AppShell', () => {
    const shell = read('components/layout/AppShell.tsx');
    expect(shell).toContain(
      "import NotificationBell from '@/components/notifications/NotificationBell'",
    );
    expect(shell).toContain('notificationBell={<NotificationBell />}');
    // Header declares the slot prop and renders it in the toolbar.
    const header = read('components/layout/Header.tsx');
    expect(header).toContain('notificationBell?: ReactNode;');
    expect(header).toContain('{notificationBell || null}');
  });

  it('links "View all notifications" to /notifications and closes the dropdown', () => {
    const drawer = read('components/notifications/NotificationDrawer.tsx');
    expect(drawer).toContain('href="/notifications"');
    expect(drawer).toContain('View all notifications');
    expect(drawer).toContain('onClick={onClose}');
  });

  it('guards /notifications for every ERP role', () => {
    const layout = read('app/notifications/layout.tsx');
    const m = layout.match(/allowed=\{([A-Za-z0-9_]+)\}/);
    expect(m).not.toBeNull();
    const constName = m![1];
    const arrMatch = layout.match(new RegExp(`const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    expect(arrMatch).not.toBeNull();
    const allowed = Array.from(arrMatch![1].matchAll(/'([^']+)'/g)).map((r) => r[1]);
    const missing = (ERP_ROLES as readonly string[]).filter((r) => !allowed.includes(r));
    expect(missing).toEqual([]);
  });
});
