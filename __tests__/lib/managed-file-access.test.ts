import { canManageManagedFile, canReadManagedFile } from '@/lib/files/access';
import type { ManagedFile } from '@/types/files';

const file = (overrides: Partial<ManagedFile> = {}) =>
  ({
    id: 'file-1',
    tenantId: 'tenant-a',
    uploadedBy: 'owner-uid',
    deletedAt: null,
    permissions: { visibility: 'private', allowedRoles: [], allowedUsers: [] },
    ...overrides,
  }) as ManagedFile;

describe('managed-file resource authorization', () => {
  it('never permits a generic cross-tenant read, including for super_admin', () => {
    expect(
      canReadManagedFile(file(), {
        tenantId: 'tenant-b',
        uid: 'platform-admin',
        role: 'super_admin',
      }),
    ).toBe(false);
  });

  it('keeps private files owner/admin-only unless explicitly shared', () => {
    expect(canReadManagedFile(file(), { tenantId: 'tenant-a', uid: 'other', role: 'sales' })).toBe(
      false,
    );
    expect(
      canReadManagedFile(file(), { tenantId: 'tenant-a', uid: 'owner-uid', role: 'sales' }),
    ).toBe(true);
    expect(
      canReadManagedFile(
        file({
          permissions: {
            visibility: 'private',
            allowedRoles: ['finance'],
            allowedUsers: ['specific-uid'],
          },
        }),
        { tenantId: 'tenant-a', uid: 'specific-uid', role: 'sales' },
      ),
    ).toBe(true);
  });

  it('does not treat a client portal user as an internal team member', () => {
    const teamFile = file({
      permissions: { visibility: 'team', allowedRoles: [], allowedUsers: [] },
    });
    expect(
      canReadManagedFile(teamFile, { tenantId: 'tenant-a', uid: 'client', role: 'client' }),
    ).toBe(false);
    expect(
      canReadManagedFile(teamFile, { tenantId: 'tenant-a', uid: 'staff', role: 'production' }),
    ).toBe(true);
  });

  it('allows only the owner or a tenant administrator to mutate/share/restore', () => {
    const shared = file({
      permissions: { visibility: 'public', allowedRoles: [], allowedUsers: [] },
    });
    expect(
      canManageManagedFile(shared, { tenantId: 'tenant-a', uid: 'reader', role: 'sales' }),
    ).toBe(false);
    expect(
      canManageManagedFile(shared, { tenantId: 'tenant-a', uid: 'owner-uid', role: 'sales' }),
    ).toBe(true);
    expect(
      canManageManagedFile(shared, { tenantId: 'tenant-a', uid: 'admin', role: 'admin' }),
    ).toBe(true);
  });
});
