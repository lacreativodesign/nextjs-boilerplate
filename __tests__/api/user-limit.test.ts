import * as fs from 'fs';
import * as path from 'path';
import { FirestoreEmulator } from './test-utils/firestore-emulator';

/**
 * Plan user-limit enforcement gate (S36, audit P1).
 *
 * Locked seats: Starter 10, Pro 20, Enterprise unlimited. Count is active,
 * non-client staff seats. Client portal users and disabled users never count.
 */

const seed = () => ({
  tenants: [
    { id: 't_starter', data: { name: 'Starter Co', plan: 'starter' } },
    { id: 't_pro', data: { name: 'Pro Co', plan: 'pro' } },
    { id: 't_ent', data: { name: 'Ent Co', plan: 'enterprise' } },
  ],
  users: [] as { id: string; data: Record<string, unknown> }[],
});

let db: FirestoreEmulator;
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));

import {
  checkUserLimit,
  PLAN_LIMIT_EXCEEDED,
  planLimitResponseBody,
} from '@/lib/billing/user-limit';

async function addUsers(
  tenantId: string,
  count: number,
  opts: {
    role?: string;
    status?: string;
    isActive?: boolean;
    isDeleted?: boolean;
  } = {},
) {
  for (let i = 0; i < count; i += 1) {
    const id = `${tenantId}_u_${opts.role || 'sales'}_${opts.status || 'active'}_${i}`;
    await db
      .collection('users')
      .doc(id)
      .set({
        uid: id,
        tenantId,
        role: opts.role || 'sales',
        status: opts.status || 'active',
        ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
        ...(opts.isDeleted !== undefined ? { isDeleted: opts.isDeleted } : {}),
      });
  }
}

beforeEach(() => {
  db = new FirestoreEmulator(seed());
});

describe('checkUserLimit', () => {
  it('allows adding a seat when a Starter tenant is under its 10-seat limit', async () => {
    await addUsers('t_starter', 9);
    const check = await checkUserLimit('t_starter', 'sales');
    expect(check.ok).toBe(true);
    expect(check.limit).toBe(10);
    expect(check.used).toBe(9);
    expect(check.plan).toBe('starter');
  });

  it('blocks adding a seat when a Starter tenant is at its 10-seat limit', async () => {
    await addUsers('t_starter', 10);
    const check = await checkUserLimit('t_starter', 'sales');
    expect(check.ok).toBe(false);
    expect(check.used).toBe(10);
  });

  it('uses the 20-seat limit for Pro tenants', async () => {
    await addUsers('t_pro', 20);
    const check = await checkUserLimit('t_pro', 'finance');
    expect(check.ok).toBe(false);
    expect(check.limit).toBe(20);
  });

  it('never limits Enterprise tenants (unlimited seats)', async () => {
    await addUsers('t_ent', 500);
    const check = await checkUserLimit('t_ent', 'sales');
    expect(check.ok).toBe(true);
    expect(check.limit).toBeLessThan(0);
  });

  it('never limits client portal users, even at a full Starter tenant', async () => {
    await addUsers('t_starter', 10);
    const check = await checkUserLimit('t_starter', 'client');
    expect(check.ok).toBe(true);
  });

  it('does not count existing client users toward the staff seat limit', async () => {
    await addUsers('t_starter', 9, { role: 'sales' });
    await addUsers('t_starter', 25, { role: 'client' });
    const check = await checkUserLimit('t_starter', 'sales');
    expect(check.ok).toBe(true);
    expect(check.used).toBe(9);
  });

  it('does not count disabled users toward the seat limit', async () => {
    await addUsers('t_starter', 10, { role: 'sales', status: 'disabled' });
    await addUsers('t_starter', 3, { role: 'sales', status: 'active' });
    const check = await checkUserLimit('t_starter', 'sales');
    expect(check.ok).toBe(true);
    expect(check.used).toBe(3);
  });

  it.each(['inactive', 'terminated', 'suspended', 'deactivated'])(
    'does not count %s users toward the seat limit',
    async (status) => {
      await addUsers('t_starter', 10, { role: 'sales', status });
      await addUsers('t_starter', 2, { role: 'sales', status: 'active' });
      const check = await checkUserLimit('t_starter', 'sales');
      expect(check.ok).toBe(true);
      expect(check.used).toBe(2);
    },
  );

  it('does not count a user explicitly marked isActive=false', async () => {
    await addUsers('t_starter', 10, { role: 'sales', status: 'active', isActive: false });
    const check = await checkUserLimit('t_starter', 'sales');
    expect(check.ok).toBe(true);
    expect(check.used).toBe(0);
  });

  it('does not count a soft-deleted user even if its status field is stale', async () => {
    await addUsers('t_starter', 10, { role: 'sales', status: 'active', isDeleted: true });
    const check = await checkUserLimit('t_starter', 'sales');
    expect(check.ok).toBe(true);
    expect(check.used).toBe(0);
  });

  it('produces an upgrade-guidance body with the plan_limit_exceeded code', async () => {
    await addUsers('t_starter', 10);
    const check = await checkUserLimit('t_starter', 'sales');
    const body = planLimitResponseBody(check);
    expect(body.error).toBe(PLAN_LIMIT_EXCEEDED);
    expect(body.message).toContain('starter');
    expect(body.message.toLowerCase()).toContain('upgrade');
  });
});

/**
 * The seat gate this suite used to pin was `checkUserLimit` — a READ — placed before
 * the creation write. That ordering is necessary but not sufficient: two concurrent
 * requests both read the same last free seat and both pass it (proved directly against
 * the real Firestore emulator in
 * __tests__/integration/staff-seat-concurrency.emulator.test.ts). Every seat-CONSUMING
 * path now holds an atomic reservation across the write instead, so this gate pins the
 * stronger primitive: reserved before the identity exists, released afterwards.
 */
describe('seat enforcement is wired into every seat-consuming path (static gate)', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it.each([
    ['app/api/admin/users/create/route.ts', 'adminAuth.createUser'],
    ['app/api/create-user/route.ts', 'adminAuth.createUser'],
    ['app/api/hr/employees/create/route.ts', 'adminAuth.createUser'],
    ['app/api/super_admin/users/route.ts', 'adminAuth.createUser'],
    ['lib/auth/sso-oauth.ts', 'adminAuth.createUser'],
    ['lib/users/user-service.ts', 'createInvitation'],
    ['app/api/users/[id]/reactivate/route.ts', 'UserService.reactivateUser'],
  ])('%s reserves a staff seat before provisioning', (file, creation) => {
    const source = read(file);
    const reserve = Math.max(
      source.indexOf('reserveStaffSeat('),
      source.indexOf('reserveStaffSeatOrThrow('),
    );
    expect(reserve).toBeGreaterThan(-1);
    expect(source).toContain('releaseStaffSeat(');
    expect(reserve).toBeLessThan(source.indexOf(creation));
  });

  it.each([
    ['app/api/admin/users/update/route.ts'],
    ['app/api/hr/employees/update/route.ts'],
    ['app/api/super_admin/users/[uid]/route.ts'],
  ])('%s reserves a staff seat for client to staff conversion', (file) => {
    const source = read(file);
    expect(source).toContain('reserveStaffSeat(');
    expect(source).toContain("'role_conversion'");
    expect(source).toContain('releaseStaffSeat(');
  });

  it.each([
    ['app/api/admin/users/create/route.ts'],
    ['app/api/create-user/route.ts'],
    ['app/api/hr/employees/create/route.ts'],
    ['app/api/super_admin/users/route.ts'],
    ['app/api/users/invite/route.ts'],
  ])('%s still returns the plan-limit upgrade guidance body', (file) => {
    expect(read(file)).toContain('planLimitResponseBody');
  });

  it('releases every reservation in a finally block so a failure cannot leak a seat', () => {
    for (const file of [
      'app/api/admin/users/create/route.ts',
      'app/api/create-user/route.ts',
      'app/api/hr/employees/create/route.ts',
      'app/api/super_admin/users/route.ts',
      'app/api/admin/users/update/route.ts',
      'app/api/hr/employees/update/route.ts',
      'app/api/super_admin/users/[uid]/route.ts',
      'app/api/users/[id]/reactivate/route.ts',
      'lib/auth/sso-oauth.ts',
      'lib/users/user-service.ts',
    ]) {
      const source = read(file);
      const release = source.indexOf('releaseStaffSeat(');
      expect(release).toBeGreaterThan(-1);
      expect(source.slice(Math.max(0, release - 200), release)).toContain('} finally {');
    }
  });

  it('no seat-consuming path is left on the raceable read-only check', () => {
    for (const file of [
      'app/api/admin/users/create/route.ts',
      'app/api/create-user/route.ts',
      'app/api/hr/employees/create/route.ts',
      'app/api/super_admin/users/route.ts',
      'app/api/super_admin/users/[uid]/route.ts',
      'app/api/admin/users/update/route.ts',
      'app/api/hr/employees/update/route.ts',
      'app/api/users/[id]/reactivate/route.ts',
      'app/api/users/invite/route.ts',
      'lib/auth/sso-oauth.ts',
    ]) {
      expect(read(file)).not.toContain('await checkUserLimit(');
    }
  });
});
