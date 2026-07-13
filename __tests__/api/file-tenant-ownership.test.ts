import * as fs from 'fs';
import * as path from 'path';

/**
 * S12 — A file belongs to the tenant that owns the project, and orphaned records are repaired.
 *
 * app/api/admin/files/create allowed a super_admin to upload into ANOTHER tenant's project,
 * but every downstream write still used the super_admin's OWN tenant:
 *   - the file record was stamped `tenantId: me.tenantId`
 *   - the storage path was built client-side from the super_admin's own tenant claim
 *   - the version-chain lookup was scoped to the super_admin's tenant
 *   - (since S11) the bytes were billed to the super_admin's storage quota
 *
 * The file was therefore invisible to the tenant that owned the project and appeared in the
 * wrong tenant's file list. The capability never worked, so it is closed rather than
 * half-repaired; super_admins have impersonation for acting inside a tenant.
 *
 * Separately, employeeDocuments written by the admin HR route carried no tenantId at all and
 * are invisible to every tenant-scoped read. A backfill derives their tenant from the
 * document's employee.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S12: files cannot be uploaded across tenants', () => {
  const src = read('app/api/admin/files/create/route.ts');

  it('no longer exempts super_admin from the project tenant check', () => {
    expect(src).not.toContain(
      "if (project?.tenantId !== me.tenantId && (me.role || '').toLowerCase() !== 'super_admin')",
    );
  });

  it('rejects any project belonging to another tenant', () => {
    expect(src).toMatch(/if \(project\?\.tenantId !== me\.tenantId\) \{/);
  });

  it('still stamps the record with the acting tenant, which now always equals the project tenant', () => {
    expect(src).toContain('tenantId: me.tenantId');
  });
});

describe('S12: orphaned HR documents can be repaired', () => {
  const src = read('lib/tenant/backfill-hr-document-tenant.ts');

  it('derives the tenant from the document employee, not a default', () => {
    expect(src).toContain("collection('users').doc(userId)");
    expect(src).not.toMatch(/DEFAULT_TENANT_ID/);
  });

  it('only touches records that are actually missing a tenantId', () => {
    expect(src).toMatch(/existing !== undefined && existing !== null && existing !== ''/);
  });

  it('never assigns an arbitrary tenant when the employee cannot be resolved', () => {
    expect(src).toContain('skippedNoEmployee');
  });

  it('is exposed as a runnable script', () => {
    const script = read('scripts/backfillHrDocumentTenant.ts');
    expect(script).toContain('backfillHrDocumentTenantIds');
  });
});
