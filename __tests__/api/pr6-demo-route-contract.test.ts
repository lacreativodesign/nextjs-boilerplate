import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('PR6 Super Admin demo routes', () => {
  it('keeps both seed and reset behind Super Admin authorization', () => {
    for (const route of [
      'app/api/super_admin/demo/seed/route.ts',
      'app/api/super_admin/demo/reset/route.ts',
    ]) {
      const source = read(route);
      expect(source).toContain('requireSuperAdmin(req)');
      expect(source).toContain('seedDemoEnvironment');
      expect(source).toContain('reset: true');
    }
  });

  it('does not accept a password from the request body', () => {
    for (const route of [
      'app/api/super_admin/demo/seed/route.ts',
      'app/api/super_admin/demo/reset/route.ts',
    ]) {
      const source = read(route);
      expect(source).not.toContain('req.json()');
      expect(source).not.toContain('password:');
    }
  });
});
