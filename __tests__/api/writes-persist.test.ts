import * as fs from 'fs';
import * as path from 'path';

/**
 * S20 — a screen that says "Saved" must actually have saved.
 *
 * The preferences screen collected a timezone, a date format and three notification toggles,
 * then "saved" them by setting a local flag and showing a success message for three seconds.
 * Nothing was ever sent to the server. The user's choices were discarded the moment they
 * navigated away, while the UI told them it had worked.
 *
 * This is the same defect class found on the lead detail page, where a status change and a new
 * note were both held only in React state. A UI that confirms a write it never performed is
 * worse than one that fails loudly: the user has no reason to retry, and believes data exists
 * that does not.
 *
 * The root cause here was that there was nowhere to put the data — the profile endpoint had no
 * concept of preferences at all.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S20: preferences are persisted server-side', () => {
  const page = read('app/settings/preferences/page.tsx');

  it('loads the saved preferences instead of hardcoded defaults', () => {
    expect(page).toContain("apiFetch('/api/users/profile'");
    expect(page).toContain('profile.preferences');
  });

  it('the save handler actually writes to the server', () => {
    expect(page).toContain("method: 'PATCH'");
    expect(page).toContain('preferences: prefs');
  });

  it('a failed save reports the failure instead of claiming success', () => {
    expect(page).toMatch(/Could not save your preferences/);
    // The old handler set a success flag unconditionally.
    expect(page).not.toMatch(/setSaved\(true\);\s*\n\s*setTimeout/);
  });

  it('success is only shown after the server confirms', () => {
    const okIndex = page.indexOf("if (!res.ok || !payload?.ok)");
    const savedIndex = page.indexOf("setStatus('saved')");
    expect(okIndex).toBeGreaterThan(-1);
    expect(savedIndex).toBeGreaterThan(okIndex);
  });
});

describe('S20: the profile endpoint accepts and stores preferences', () => {
  const route = read('app/api/users/profile/route.ts');

  it('validates preferences rather than accepting an arbitrary blob', () => {
    expect(route).toContain('const preferencesSchema = z.object({');
    expect(route).toContain('preferences: preferencesSchema.optional()');
  });

  it('constrains the date format to known values', () => {
    expect(route).toMatch(/dateFormat: z\.enum\(/);
  });

  it('merges preference keys rather than replacing the whole object', () => {
    // Replacing wholesale would wipe the toggles a user did not touch.
    expect(route).toContain('userUpdates[`preferences.${key}`] = value');
  });

  it('returns preferences so the screen can load them back', () => {
    expect(route).toMatch(/preferences: \{/);
    expect(route).toContain('data.preferences?.timezone');
  });

  it('still requires an authenticated user', () => {
    expect(route).toContain('const me = await getCurrentUser();');
  });
});
