import * as fs from 'fs';
import * as path from 'path';
import { FirestoreEmulator } from './test-utils/firestore-emulator';

/**
 * Plan user-limit enforcement gate (S36, audit P1).
 *
 * Locked seats: Starter 10 staff and 10 client-portal users; Pro 20 staff and
 * unlimited portal users; Enterprise unlimited. Disabled users never count.
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
  opts: { role?: string; status?: string } = {},
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

  it('blocks a Starter client portal user at the separate 10-seat limit', async () => {
    await addUsers('t_starter', 10, { role: 'client' });
    const check = await checkUserLimit('t_starter', 'client');
    expect(check.ok).toBe(false);
    expect(check.limit).toBe(10);
    expect(check.used).toBe(10);
    expect(check.seatType).toBe('client_portal');
  });

  it('keeps Pro client portal users unlimited', async () => {
    await addUsers('t_pro', 50, { role: 'client' });
    const check = await checkUserLimit('t_pro', 'client');
    expect(check.ok).toBe(true);
    expect(check.limit).toBeLessThan(0);
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

  it('produces an upgrade-guidance body with the plan_limit_exceeded code', async () => {
    await addUsers('t_starter', 10);
    const check = await checkUserLimit('t_starter', 'sales');
    const body = planLimitResponseBody(check);
    expect(body.error).toBe(PLAN_LIMIT_EXCEEDED);
    expect(body.message).toContain('starter');
    expect(body.message.toLowerCase()).toContain('upgrade');
  });
});

describe('user-limit enforcement is wired into every creation path (static gate)', () => {
  const read = (relative: string): string =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it.each([
    ['app/api/admin/users/create/route.ts'],
    ['app/api/create-user/route.ts'],
    ['app/api/users/invite/route.ts'],
  ])('%s enforces checkUserLimit before creating the user', (file) => {
    const source = read(file);
    expect(source).toContain('checkUserLimit');
    expect(source).toContain('planLimitResponseBody');
    // enforcement precedes the auth/user or invite creation
    const check = source.indexOf('checkUserLimit');
    const creation = Math.min(
      ...['adminAuth.createUser', 'UserService.inviteUser']
        .map((m) => source.indexOf(m))
        .filter((i) => i > -1),
    );
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(creation);
  });
});
