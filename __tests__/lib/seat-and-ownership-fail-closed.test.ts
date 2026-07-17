import * as fs from 'fs';
import * as path from 'path';

/**
 * S9 — Seat integrity + ownership fail closed.
 *
 * 1. Pending invitations consumed NO seat. countBillableSeats() only counted the users
 *    collection, so a Starter tenant sitting at 9 of 10 seats could issue an unlimited
 *    number of invitations — every one measured against a count that ignored the
 *    invitations already in flight — and blow far past its plan once they were accepted.
 *
 * 2. Accepting an invitation performed NO seat check at all, so even a correct
 *    invite-time decision could be overtaken by events (other acceptances, a downgrade).
 *
 * 3. checkPermission() skipped the ownership test entirely when a caller supplied no
 *    ownerId. A custom role scoped to "own records only" therefore reached every record
 *    in the tenant simply by omitting ownerId — the restriction was opt-in.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S9: pending invitations reserve a seat', () => {
  const src = read('lib/billing/user-limit.ts');

  it('counts pending invitations alongside users', () => {
    expect(src).toContain("collection('user_invitations')");
    expect(src).toContain("where('status', '==', 'pending')");
    expect(src).toContain("where('tenantId', '==', tenantId)");
  });

  it('still excludes client-portal seats from the staff limit', () => {
    const clientSkips = src.match(/if \(role === 'client'\) continue;/g) || [];
    expect(clientSkips.length).toBeGreaterThanOrEqual(2);
  });

  it('does not let an expired invitation hold a seat', () => {
    expect(src).toContain('expiresMs < now');
  });
});

describe('S9: acceptance re-checks the seat limit', () => {
  const src = read('lib/users/user-service.ts');

  it('checks the limit before creating the auth user', () => {
    expect(src).toContain('checkUserLimit(invitation.tenantId, invitation.role)');
    const checkAt = src.indexOf('checkUserLimit(invitation.tenantId');
    const createAt = src.indexOf('adminAuth.createUser(');
    expect(checkAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(createAt);
  });

  it('refuses acceptance when the tenant is genuinely over its limit', () => {
    expect(src).toMatch(/seatCheck\.used > seatCheck\.limit/);
    expect(src).toMatch(/reached its plan limit/i);
  });
});

describe('S9: ownOnly permissions fail closed', () => {
  const src = read('lib/permissions/permission-engine.ts');

  it('no longer skips the ownership test when ownerId is absent', () => {
    expect(src).not.toContain(
      'if (ownershipRestricted && input.ownerId && input.ownerId !== input.userId)',
    );
  });

  it('denies an ownership-restricted action that supplies no owner', () => {
    expect(src).toContain('if (!input.ownerId)');
    expect(src).toMatch(/no record owner was supplied/);
  });

  it('still denies an ownership-restricted action on someone else record', () => {
    expect(src).toContain('input.ownerId !== input.userId');
  });

  it('exempts create, which has no owner yet', () => {
    expect(src).toContain("input.action !== 'create'");
  });
});
