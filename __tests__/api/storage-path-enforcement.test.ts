import * as fs from 'fs';
import * as path from 'path';
import { isTenantStoragePath } from '@/lib/storage/paths';

/**
 * S5 — Storage rules + server-side storagePath enforcement.
 *
 * Two independent layers protect Storage:
 *  1. storage.rules authorizes the OBJECT: the tenant segment of the path must match
 *     the caller's tenantId claim. Previously no rules were deployed at all, so the
 *     bucket ran on Firebase's default "any signed-in user can read/write anything".
 *  2. The upload APIs authorize the REFERENCE: they persist a storagePath taken from
 *     the request body, so that path must be proven to sit inside the caller's tenant
 *     prefix before it is written.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S5: isTenantStoragePath', () => {
  it('accepts a path inside the caller tenant', () => {
    expect(isTenantStoragePath('tenants/t1/projects/p1/Brief/f1_a.png', 't1')).toBe(true);
  });

  it('rejects another tenant prefix', () => {
    expect(isTenantStoragePath('tenants/t2/projects/p1/Brief/f1_a.png', 't1')).toBe(false);
  });

  it('rejects a tenant prefix that merely starts with the same characters', () => {
    // "t1" must not authorize "t10".
    expect(isTenantStoragePath('tenants/t10/projects/p1/f1_a.png', 't1')).toBe(false);
  });

  it('rejects legacy flat paths', () => {
    expect(isTenantStoragePath('projects/p1/Brief/f1_a.png', 't1')).toBe(false);
    expect(isTenantStoragePath('client-files/p1/f1_a.png', 't1')).toBe(false);
    expect(isTenantStoragePath('employees/u1/Contract/d1_a.pdf', 't1')).toBe(false);
  });

  it('rejects traversal, leading slash and separator injection', () => {
    expect(isTenantStoragePath('tenants/t1/../t2/x.png', 't1')).toBe(false);
    expect(isTenantStoragePath('/tenants/t1/x.png', 't1')).toBe(false);
    expect(isTenantStoragePath('tenants/t1/..\\t2/x.png', 't1')).toBe(false);
  });

  it('fails closed on a blank tenant or blank path', () => {
    expect(isTenantStoragePath('tenants/t1/x.png', '')).toBe(false);
    expect(isTenantStoragePath('', 't1')).toBe(false);
  });
});

describe('S5: every upload route validates the client-supplied storagePath', () => {
  const ROUTES = [
    'app/api/admin/hr/documents/upload/route.ts',
    'app/api/hr/documents/upload/route.ts',
    'app/api/admin/files/create/route.ts',
    'app/api/am/files/upload/route.ts',
    'app/api/production/files/upload/route.ts',
    'app/api/client/files/upload/route.ts',
  ];

  it.each(ROUTES)('%s calls isTenantStoragePath before persisting', (rel) => {
    const src = read(rel);
    expect(src).toContain('isTenantStoragePath(storagePath');
    expect(src).toMatch(/Invalid storage path/);
  });
});

describe('S5: storage.rules', () => {
  const rules = read('storage.rules');

  it('is wired into firebase.json', () => {
    const cfg = JSON.parse(read('firebase.json'));
    expect(cfg.storage?.rules).toBe('storage.rules');
  });

  it('scopes access by the tenant segment of the path', () => {
    // STOR-1: `match /tenants/{tenantId}/{allPaths=**}` is now the DENY-ALL for tenant
    // prefixes with no explicit grant, not the grant itself. Access is granted per
    // prefix to specific roles; __tests__/config/storage-rules-guard.test.ts pins that
    // matrix and is re-run inside the deploy workflow before the ruleset is published.
    expect(rules).toContain('callerTenant() == tenantId');
    expect(rules).toContain('match /tenants/{tenantId}/projects/{allPaths=**}');
    expect(rules).toContain('match /tenants/{tenantId}/client-files/{allPaths=**}');
  });

  it('fails closed on a missing or blank tenant claim', () => {
    expect(rules).toContain('callerTenant() is string');
    expect(rules).toContain("callerTenant() != ''");
  });

  it('denies everything outside a tenant prefix', () => {
    expect(rules).toMatch(/match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
  });

  it('never grants blanket access to any signed-in user', () => {
    expect(rules).not.toMatch(/allow read, write: if request\.auth != null/);
  });
});
