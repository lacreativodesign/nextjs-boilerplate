import fs from 'fs';
import path from 'path';

/**
 * Regression guard for firestore.rules.
 *
 * Firestore rules are published to Firebase (by the Deploy Firestore Rules
 * workflow) rather than executed from this repo, so a bad edit cannot be caught
 * by the type checker or by any runtime test. These assertions are the safety
 * net: they run on every PR and again inside the protected manual deployment
 * workflow, before a dangerous ruleset can be published.
 *
 * Comments are stripped before matching so that explanatory prose describing an
 * old rule can never be mistaken for the rule itself.
 */

const rulesSource = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

/** Rules text with all // comments removed, so only live directives are matched. */
const activeRules = rulesSource.replace(/\/\/.*/g, '');

describe('firestore.rules — structural guarantees', () => {
  it('declares rules_version 2', () => {
    expect(rulesSource.trimStart().startsWith("rules_version = '2';")).toBe(true);
  });

  it('keeps a deny-all fallback so unlisted collections are server-SDK only', () => {
    expect(activeRules).toContain('allow read, write: if false;');
  });
});

describe('firestore.rules — dangerous patterns', () => {
  it('never grants an unconditional allow (if true)', () => {
    const worldOpen = activeRules.match(/allow[^:]*:\s*if\s+true/g) || [];
    expect(worldOpen).toEqual([]);
  });

  it('never allows client-SDK writes; all mutations go through the Admin SDK', () => {
    // Every `allow write` / `allow read, write` resolves to `if false`, including
    // Super Admin. Privileged mutations are API calls, not browser SDK writes.
    const writeGrants = activeRules.match(/allow[^:\n]*\bwrite\b[^:\n]*:\s*if\s+([^;]+);/g) || [];
    const nonFalseWrites = writeGrants.filter((grant) => !/:\s*if\s+false\s*;/.test(grant));
    expect(nonFalseWrites).toEqual([]);
  });

  it('does not grant Super Admin a global browser-SDK wildcard', () => {
    expect(activeRules).not.toMatch(
      /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isSuperAdmin\(\)/,
    );
  });
});

describe('firestore.rules — launch settings are API-only', () => {
  it('explicitly denies browser reads and writes to every global settings document', () => {
    const block = activeRules.match(/match\s+\/settings\/\{docId\}\s*\{([\s\S]*?)\}/)?.[1] || '';
    expect(block).toContain('allow read, write: if false;');
  });

  it('contains no client-readable launchChecklist exception', () => {
    expect(activeRules).not.toMatch(/launchChecklist[\s\S]{0,120}allow\s+read:\s*if/);
  });
});

describe('firestore.rules — support ticket confidentiality (S2 regression guard)', () => {
  /**
   * A blanket `/tenants/{tenantId}/{subcollection=**}` read once exposed EVERY
   * tenant subcollection to the browser, including support_tickets internal
   * notes, reporter emails, and screenshots. It was replaced by an explicit
   * activity_feed rule plus a deny-all for everything else. Re-introducing the
   * wildcard would silently reopen that leak, so it is blocked here.
   */
  it('does not reintroduce the blanket tenant-subcollection read', () => {
    expect(activeRules).not.toContain('subcollection=**');
  });

  it('keeps activity_feed as the only browser-readable tenant subcollection', () => {
    expect(activeRules).toContain('/tenants/{tenantId}/activity_feed/{docId}');
  });

  it('denies all other tenant subcollections, including support_tickets', () => {
    expect(activeRules).toContain('/tenants/{tenantId}/{subcollection}/{docId=**}');
  });

  it('grants no explicit read rule to support_tickets', () => {
    expect(activeRules).not.toContain('support_tickets');
  });
});
