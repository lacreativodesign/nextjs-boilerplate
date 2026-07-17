import * as fs from 'fs';
import * as path from 'path';
import { ERP_ROLES } from '@/lib/erpAccess';

/**
 * F3 — every role can reach personal notification preferences from the header menu.
 *
 * The header's "Notification Preferences" item previously pointed every role at
 * /admin/settings/notifications — a tenant-level, admin-only page. Nine of the eleven roles
 * were rejected on click. The link now points at /settings/preferences, whose layout
 * RequireAuth allow-list is the full role set, so it is reachable by everyone.
 *
 * This test pins two facts and fails the build if either regresses:
 *   1. The header links notification preferences to /settings/preferences (not the admin page).
 *   2. The /settings layout (which guards /settings/preferences) allows every ERP role.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('F3: personal notification preferences are reachable by all roles', () => {
  it('the header links Notification Preferences to /settings/preferences', () => {
    const header = read('components/layout/Header.tsx');
    expect(header).toContain("navigateFromMenu('/settings/preferences')");
    // The old admin-only destination must not reappear on this control.
    expect(header).not.toContain("navigateFromMenu('/admin/settings/notifications')");
  });

  it('the settings layout that guards /settings/preferences allows every ERP role', () => {
    const layout = read('app/settings/layout.tsx');
    const m = layout.match(/allowed=\{([A-Za-z0-9_]+)\}/);
    expect(m).not.toBeNull();
    // The allow-list is a named const in the same file; read its members.
    const constName = m![1];
    const arrMatch = layout.match(new RegExp(`const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    expect(arrMatch).not.toBeNull();
    const allowed = Array.from(arrMatch![1].matchAll(/'([^']+)'/g)).map((r) => r[1]);
    const missing = (ERP_ROLES as readonly string[]).filter((r) => !allowed.includes(r));
    expect(missing).toEqual([]);
  });
});
