import {
  TENANT_STORAGE_ROOT,
  tenantProjectFilePath,
  tenantClientFilePath,
  tenantEmployeeFilePath,
  tenantEmployeeDocumentPath,
} from '@/lib/storage/paths';

import * as fs from 'fs';
import * as path from 'path';

/**
 * S4 — Every Storage object must live under tenants/{tenantId}/...
 *
 * Storage paths were previously flat and global (projects/..., employees/...,
 * client-files/...). A path with no tenant segment cannot be protected by Storage
 * rules, so any authenticated user in any tenant could address any other tenant's
 * object. These paths are the foundation the S5 storage.rules depend on.
 */
describe('S4: tenant-scoped storage paths', () => {
  it('prefixes every path with tenants/{tenantId}', () => {
    expect(
      tenantProjectFilePath({
        tenantId: 't1',
        projectId: 'p1',
        category: 'Deliverable',
        fileId: 'f1',
        safeName: 'a.png',
      }),
    ).toBe(`${TENANT_STORAGE_ROOT}/t1/projects/p1/Deliverable/f1_a.png`);

    expect(
      tenantClientFilePath({ tenantId: 't1', projectId: 'p1', fileId: 'f1', safeName: 'a.png' }),
    ).toBe(`${TENANT_STORAGE_ROOT}/t1/client-files/p1/f1_a.png`);

    expect(
      tenantEmployeeFilePath({
        tenantId: 't1',
        userId: 'u1',
        docType: 'Contract',
        docId: 'd1',
        safeName: 'a.pdf',
      }),
    ).toBe(`${TENANT_STORAGE_ROOT}/t1/employees/u1/Contract/d1_a.pdf`);

    expect(
      tenantEmployeeDocumentPath({ tenantId: 't1', userId: 'u1', docId: 'd1', safeName: 'a.pdf' }),
    ).toBe(`${TENANT_STORAGE_ROOT}/t1/employee-documents/u1/d1_a.pdf`);
  });

  it('never emits a leading slash (the old HR path did, breaking the prefix)', () => {
    const p = tenantEmployeeDocumentPath({
      tenantId: 't1',
      userId: 'u1',
      docId: 'd1',
      safeName: 'a.pdf',
    });
    expect(p.startsWith('/')).toBe(false);
    expect(p.startsWith(`${TENANT_STORAGE_ROOT}/`)).toBe(true);
  });

  it('rejects path traversal and separator injection in any segment', () => {
    expect(() =>
      tenantProjectFilePath({
        tenantId: 't1',
        projectId: '../../other-tenant',
        category: 'c',
        fileId: 'f',
        safeName: 'a.png',
      }),
    ).toThrow(/Invalid project/);

    expect(() =>
      tenantClientFilePath({
        tenantId: 't1',
        projectId: 'p1/../..',
        fileId: 'f',
        safeName: 'a.png',
      }),
    ).toThrow(/Invalid project/);

    expect(() =>
      tenantEmployeeFilePath({
        tenantId: '',
        userId: 'u1',
        docType: 'c',
        docId: 'd',
        safeName: 'a.pdf',
      }),
    ).toThrow(/Invalid tenant/);
  });
});

describe('S4: no upload surface writes a flat, non-tenant path', () => {
  const SURFACES = [
    'app/admin/hr/documents/page.tsx',
    'app/hr/documents/page.tsx',
    'app/admin/projects/files/page.tsx',
    'app/am/files/page.tsx',
    'app/client/files/page.tsx',
    'components/am/AMProjectDrawer.tsx',
    'components/production/ProductionProjectDrawer.tsx',
  ];

  it.each(SURFACES)('%s builds its path via the tenant-scoped helper', (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).toContain('getCurrentTenantId()');
    expect(src).not.toMatch(/`projects\/\$\{/);
    expect(src).not.toMatch(/`client-files\/\$\{/);
    expect(src).not.toMatch(/`employees\/\$\{/);
    expect(src).not.toMatch(/`\/employee-documents\/\$\{/);
  });
});
