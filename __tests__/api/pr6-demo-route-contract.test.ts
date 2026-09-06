/**
 * PR6 — the Super Admin demo endpoints, exercised rather than described.
 *
 * Both endpoints rebuild the golden tenant, which is a destructive tenant-scoped
 * write. Reading the route source can only show that the words "requireSuperAdmin"
 * and "reset: true" appear somewhere in it; it cannot show that authorization is
 * resolved BEFORE any data is touched, nor that `bizosto-demo` is the only tenant
 * either route is able to rebuild. Those are the properties checked here.
 */
import fs from 'fs';
import path from 'path';

const requireSuperAdmin = jest.fn();
const seedDemoEnvironment = jest.fn();

jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdmin(...args),
}));
jest.mock('@/lib/demo/seed', () => ({
  seedDemoEnvironment: (...args: unknown[]) => seedDemoEnvironment(...args),
}));

import { POST as resetRoute } from '@/app/api/super_admin/demo/reset/route';
import { POST as seedRoute } from '@/app/api/super_admin/demo/seed/route';
import { DEMO_TENANT_ID } from '@/lib/demo/users';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const COUNTS = {
  clients: 5,
  leads: 5,
  deals: 1,
  invoices: 4,
  projects: 3,
  productionJobs: 3,
  employees: 4,
};

const ROUTES = [
  { action: 'seed', handler: seedRoute, message: 'Demo environment seeded successfully' },
  { action: 'reset', handler: resetRoute, message: 'Demo environment reset successfully' },
];

/** The routes only forward the request to `requireSuperAdmin`, so a marker object is enough. */
const demoRequest = () => ({ __demoRequest: true }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  seedDemoEnvironment.mockResolvedValue({ tenantId: DEMO_TENANT_ID, counts: COUNTS });
});

for (const route of ROUTES) {
  describe(`PR6 Super Admin demo route: ${route.action}`, () => {
    it('rebuilds the canonical fixture for the demo tenant and no other', async () => {
      const req = demoRequest();

      const response = await route.handler(req);
      const body = await response.json();

      expect(requireSuperAdmin).toHaveBeenCalledWith(req);
      expect(seedDemoEnvironment).toHaveBeenCalledTimes(1);
      expect(seedDemoEnvironment).toHaveBeenCalledWith({
        tenantId: DEMO_TENANT_ID,
        reset: true,
      });
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ok: true, message: route.message, counts: COUNTS });
    });

    it('touches no tenant data when Super Admin authorization fails', async () => {
      requireSuperAdmin.mockRejectedValueOnce(new Error('Forbidden'));

      const response = await route.handler(demoRequest());
      const body = await response.json();

      expect(seedDemoEnvironment).not.toHaveBeenCalled();
      expect(response.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
}

describe('PR6 Super Admin demo routes', () => {
  it('never reads a password or any other caller-supplied field from the request', () => {
    for (const file of [
      'app/api/super_admin/demo/_handler.ts',
      'app/api/super_admin/demo/seed/route.ts',
      'app/api/super_admin/demo/reset/route.ts',
    ]) {
      const source = read(file);
      expect(source).not.toContain('req.json()');
      expect(source).not.toContain('password');
    }
  });
});
