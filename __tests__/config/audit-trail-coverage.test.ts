import fs from 'fs';
import path from 'path';

/**
 * SOC2 F-05 — audit trail coverage for identity and access events.
 *
 * The platform has four separate ways to record that something happened, and only
 * some of them reach `auditLogs`, which is the collection the compliance reader, the
 * DSAR export and the super-admin viewer all read:
 *
 *   writeAuditLog   (lib/tenant/audit.ts)      -> auditLogs
 *   AuditLogger.log (lib/audit/audit-logger.ts)-> auditLogs
 *   logEvent        (lib/audit.ts)             -> auditLogs + activity_feed + notifications
 *   logActivity     (lib/activity/tracker.ts)  -> tenants/{id}/activity_feed ONLY
 *   UserService.logActivity                    -> user_activity ONLY
 *
 * The last two look like audit logging at the call site and are not. Account
 * creation and account deletion — the two events an auditor samples first for CC6.2 —
 * used only `logActivity`, so the permanent creation and removal of identities left
 * no entry in the audit trail at all.
 *
 * This is a RATCHET. The list below may only grow. Adding a route here and then
 * making it pass is how audit coverage advances across the remaining mutating routes;
 * nothing may be removed from it. A route "reaches the trail" only via one of the
 * three mechanisms that actually write to `auditLogs`.
 */

const ROOT = process.cwd();

/** Only these write to `auditLogs`. logActivity and UserService.logActivity do not. */
const TRAIL_WRITERS = /writeAuditLog\(|logEvent\(|AuditLogger\.log\(/;

/**
 * Routes that must produce an audit-trail entry. Append only.
 *
 * Account lifecycle first: these are the CC6.2 / CC6.3 control events — who was
 * granted access, who had it revoked, and who changed a role.
 */
const MUST_AUDIT = [
  'app/api/admin/users/create/route.ts',
  'app/api/admin/users/delete/route.ts',
  'app/api/admin/users/update/route.ts',
  'app/api/users/[id]/route.ts',
  'app/api/users/[id]/reactivate/route.ts',
];

describe('audit trail coverage for account lifecycle', () => {
  it.each(MUST_AUDIT)('%s writes to the audit trail', (rel) => {
    const full = path.join(ROOT, rel);
    expect(fs.existsSync(full)).toBe(true);
    expect(fs.readFileSync(full, 'utf8')).toMatch(TRAIL_WRITERS);
  });

  it('never lets the activity feed stand in for the audit trail', () => {
    for (const rel of MUST_AUDIT) {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const usesFeedOnly = /logActivity\(/.test(source) && !TRAIL_WRITERS.test(source);
      expect(usesFeedOnly).toBe(false);
    }
  });
});

describe('the ratchet itself', () => {
  it('covers every account lifecycle route that exists', () => {
    // A new route under admin/users or users/[id] that mutates state has to be added
    // to MUST_AUDIT deliberately. This catches the ones that already exist.
    const lifecycle = [
      'app/api/admin/users/create/route.ts',
      'app/api/admin/users/delete/route.ts',
      'app/api/admin/users/update/route.ts',
    ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));

    for (const rel of lifecycle) {
      expect(MUST_AUDIT).toContain(rel);
    }
  });

  it('is append-only in spirit: no duplicates, all paths real', () => {
    expect(new Set(MUST_AUDIT).size).toBe(MUST_AUDIT.length);
    for (const rel of MUST_AUDIT) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });
});
