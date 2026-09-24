/**
 * P0-07 — protected downloads are authorized per resource, then minted short-lived.
 *
 * Covers every refactored download surface:
 *   - lib/files/project-file-access.ts           the per-role project ACL (files)
 *   - app/api/project-files/[id]/download         project deliverables + client uploads
 *   - app/api/hr/documents/[id]/download          employee documents
 *   - app/api/super_admin/tickets/[id]/screenshot support screenshots (super_admin only)
 *   - lib/storage/protected-download.ts           the minter every route shares
 *
 * The ACL matrix runs against a Firestore double, so the decision is executed, not read.
 */

import { FakeDb } from '../lib/test-utils/firestore-quota-double';

let db: FakeDb;
const getSignedUrl = jest.fn();
const bucketCalls = jest.fn();
const checkModuleAccess = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
  adminStorage: {
    bucket: (name?: string) => {
      bucketCalls(name);
      return {
        file: (path: string) => ({
          getSignedUrl: (config: unknown) => getSignedUrl(path, config),
        }),
      };
    },
  },
}));
jest.mock('@/lib/storage/bucket', () => ({
  getStorageBucketName: () => 'la-creativo-erp.firebasestorage.app',
}));
jest.mock('@/app/lib/plan-enforcement', () => ({
  checkModuleAccess: (...args: unknown[]) => checkModuleAccess(...args),
}));

const getCurrentUser = jest.fn();
const requireClient = jest.fn();
const requireHrAccess = jest.fn();
const requireSuperAdmin = jest.fn();

jest.mock('@/app/api/admin/_utils', () => ({
  ...jest.requireActual('@/app/api/admin/_utils'),
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('@/app/api/client/_utils', () => ({ requireClient: () => requireClient() }));
jest.mock('@/app/api/hr/_utils', () => ({ requireHrAccess: () => requireHrAccess() }));
jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (req: unknown) => requireSuperAdmin(req),
}));

import { authorizeProjectFileDownload } from '@/lib/files/project-file-access';
import {
  MAX_PROTECTED_DOWNLOAD_TTL_MS,
  PROTECTED_DOWNLOAD_TTL_MS,
  ProtectedDownloadRefused,
  contentDisposition,
  mintProtectedDownloadUrl,
} from '@/lib/storage/protected-download';
import { GET as projectFileDownload } from '@/app/api/project-files/[id]/download/route';
import { GET as hrDocumentDownload } from '@/app/api/hr/documents/[id]/download/route';
import { GET as screenshotDownload } from '@/app/api/super_admin/tickets/[ticketId]/screenshot/route';

const T = 'tenant_a';
const OTHER = 'tenant_b';
const SIGNED =
  'https://storage.googleapis.com/la-creativo-erp.firebasestorage.app/x?X-Goog-Signature=abc';

const users = {
  admin: { uid: 'u_admin', role: 'admin', tenantId: T },
  superAdmin: { uid: 'u_super', role: 'super_admin', tenantId: T },
  salesManager: { uid: 'u_sm', role: 'sales_manager', tenantId: T },
  am: { uid: 'u_am', role: 'am', tenantId: T },
  otherAm: { uid: 'u_am2', role: 'am', tenantId: T },
  production: { uid: 'u_prod', role: 'production', tenantId: T },
  productionManager: { uid: 'u_pm', role: 'production_manager', tenantId: T },
  unassignedProduction: { uid: 'u_prod2', role: 'production', tenantId: T },
  client: { uid: 'u_client', role: 'client', tenantId: T, clientId: 'client_1' },
  otherClient: { uid: 'u_client2', role: 'client', tenantId: T, clientId: 'client_2' },
  hr: { uid: 'u_hr', role: 'hr', tenantId: T },
  finance: { uid: 'u_fin', role: 'finance', tenantId: T },
  sales: { uid: 'u_sales', role: 'sales', tenantId: T },
  foreignAdmin: { uid: 'u_admin_b', role: 'admin', tenantId: OTHER },
};

const FILE_PATH = `tenants/${T}/projects/project_1/Draft/f1_brief.pdf`;

function seed() {
  db = new FakeDb();
  db.seed('projects', [
    [
      'project_1',
      {
        tenantId: T,
        clientId: 'client_1',
        ownerAmUid: users.am.uid,
        productionUid: users.production.uid,
        assignedProductionIds: [users.productionManager.uid],
        isDeleted: false,
      },
    ],
    [
      'project_deleted',
      { tenantId: T, clientId: 'client_1', ownerAmUid: users.am.uid, isDeleted: true },
    ],
  ]);
  db.seed('files', [
    [
      'file_1',
      {
        tenantId: T,
        projectId: 'project_1',
        clientId: 'client_1',
        fileName: 'brief.pdf',
        storagePath: FILE_PATH,
        isDeleted: false,
      },
    ],
    [
      'file_deleted',
      {
        tenantId: T,
        projectId: 'project_1',
        clientId: 'client_1',
        fileName: 'x.pdf',
        storagePath: FILE_PATH,
        isDeleted: true,
      },
    ],
    [
      'file_foreign',
      {
        tenantId: OTHER,
        projectId: 'project_b',
        clientId: 'client_b',
        fileName: 'x.pdf',
        storagePath: `tenants/${OTHER}/projects/project_b/x.pdf`,
        isDeleted: false,
      },
    ],
    [
      'file_infected',
      {
        tenantId: T,
        projectId: 'project_1',
        clientId: 'client_1',
        fileName: 'x.exe',
        storagePath: FILE_PATH,
        isDeleted: false,
        virusScanStatus: 'infected',
      },
    ],
    [
      'file_on_deleted_project',
      {
        tenantId: T,
        projectId: 'project_deleted',
        clientId: 'client_1',
        fileName: 'x.pdf',
        storagePath: `tenants/${T}/projects/project_deleted/x.pdf`,
        isDeleted: false,
      },
    ],
    // Registered before P0-07 with a path belonging to a DIFFERENT project.
    [
      'file_cross_bound',
      {
        tenantId: T,
        projectId: 'project_1',
        clientId: 'client_1',
        fileName: 'x.pdf',
        storagePath: `tenants/${T}/projects/project_2/secret.pdf`,
        isDeleted: false,
      },
    ],
    [
      'file_legacy',
      {
        tenantId: T,
        projectId: 'project_1',
        clientId: 'client_1',
        fileName: 'x.pdf',
        storagePath: 'projects/project_1/x.pdf',
        isDeleted: false,
      },
    ],
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  checkModuleAccess.mockResolvedValue({ ok: true });
  getSignedUrl.mockResolvedValue([SIGNED]);
});

describe('project file ACL (authorizeProjectFileDownload)', () => {
  const allowed: Array<keyof typeof users> = [
    'admin',
    'superAdmin',
    'salesManager',
    'am',
    'production',
    'productionManager',
    'client',
  ];
  const denied: Array<keyof typeof users> = [
    'otherAm',
    'unassignedProduction',
    'otherClient',
    'hr',
    'finance',
    'sales',
  ];

  it.each(allowed)('allows %s', async (who) => {
    await expect(authorizeProjectFileDownload(users[who], 'file_1')).resolves.toMatchObject({
      ok: true,
      record: { storagePath: FILE_PATH, tenantId: T, projectId: 'project_1' },
    });
  });

  it.each(denied)('denies %s with 403 (same tenant, no resource right)', async (who) => {
    await expect(authorizeProjectFileDownload(users[who], 'file_1')).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('denies a caller from another tenant with 404, never 403 (no existence oracle)', async () => {
    await expect(authorizeProjectFileDownload(users.foreignAdmin, 'file_1')).resolves.toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    await expect(authorizeProjectFileDownload(users.admin, 'file_foreign')).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('denies a deleted record to everyone, admin included', async () => {
    for (const who of ['admin', 'superAdmin', 'am'] as const) {
      await expect(authorizeProjectFileDownload(users[who], 'file_deleted')).resolves.toMatchObject(
        {
          ok: false,
          status: 404,
        },
      );
    }
  });

  it('denies a missing record and an unauthenticated caller', async () => {
    await expect(authorizeProjectFileDownload(users.admin, 'nope')).resolves.toMatchObject({
      status: 404,
    });
    await expect(authorizeProjectFileDownload(null, 'file_1')).resolves.toMatchObject({
      status: 401,
    });
  });

  it('keeps the virus-scan gate: an infected file is refused even to admin', async () => {
    await expect(authorizeProjectFileDownload(users.admin, 'file_infected')).resolves.toMatchObject(
      {
        ok: false,
        status: 403,
        code: 'file_infected',
      },
    );
  });

  it('denies project-scoped roles when the project is deleted', async () => {
    for (const who of ['am', 'client'] as const) {
      await expect(
        authorizeProjectFileDownload(users[who], 'file_on_deleted_project'),
      ).resolves.toMatchObject({ ok: false, status: 403 });
    }
  });

  it('applies the plan entitlement to am and production, exactly as their list routes do', async () => {
    checkModuleAccess.mockResolvedValue({ ok: false });
    await expect(authorizeProjectFileDownload(users.am, 'file_1')).resolves.toMatchObject({
      status: 403,
    });
    await expect(authorizeProjectFileDownload(users.production, 'file_1')).resolves.toMatchObject({
      status: 403,
    });
    // Tenant-wide roles are not narrowed by the module check.
    await expect(authorizeProjectFileDownload(users.admin, 'file_1')).resolves.toMatchObject({
      ok: true,
    });
  });

  it('rejects an id that could address a subcollection', async () => {
    await expect(authorizeProjectFileDownload(users.admin, 'file_1/x')).resolves.toMatchObject({
      status: 404,
    });
  });
});

describe('GET /api/project-files/[id]/download', () => {
  const call = (id: string, query = '') =>
    projectFileDownload(new Request(`https://app.local/api/project-files/${id}/download${query}`), {
      params: Promise.resolve({ id }),
    });

  it('redirects an authorized caller to a short-lived signed URL, uncached', async () => {
    getCurrentUser.mockResolvedValue(users.am);
    const res = await call('file_1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SIGNED);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const [[path, config]] = getSignedUrl.mock.calls;
    expect(path).toBe(FILE_PATH);
    expect(config).toMatchObject({ version: 'v4', action: 'read' });
    expect(config.expires - Date.now()).toBeLessThanOrEqual(PROTECTED_DOWNLOAD_TTL_MS);
    expect(bucketCalls).toHaveBeenCalledWith('la-creativo-erp.firebasestorage.app');
  });

  it('returns JSON for ?format=json and still never caches it', async () => {
    getCurrentUser.mockResolvedValue(users.admin);
    const res = await call('file_1', '?format=json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    await expect(res.json()).resolves.toMatchObject({ ok: true, url: SIGNED });
  });

  it('mints nothing for an unauthenticated, cross-tenant, deleted or unassigned request', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call('file_1')).status).toBe(401);
    getCurrentUser.mockResolvedValue(users.foreignAdmin);
    expect((await call('file_1')).status).toBe(404);
    getCurrentUser.mockResolvedValue(users.admin);
    expect((await call('file_deleted')).status).toBe(404);
    getCurrentUser.mockResolvedValue(users.unassignedProduction);
    expect((await call('file_1')).status).toBe(403);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("resolves a client's clientId from the portal profile, not the request", async () => {
    getCurrentUser.mockResolvedValue({ ...users.client, clientId: 'client_2' });
    requireClient.mockResolvedValue({
      ok: true,
      user: users.client,
      clientId: 'client_1',
      tenantId: T,
    });
    expect((await call('file_1')).status).toBe(302);

    requireClient.mockResolvedValue({
      ok: true,
      user: users.client,
      clientId: 'client_2',
      tenantId: T,
    });
    expect((await call('file_1')).status).toBe(403);
  });

  it('refuses (409) a legacy record whose path belongs to a different project', async () => {
    getCurrentUser.mockResolvedValue(users.admin);
    const res = await call('file_cross_bound');
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'storage_path_mismatch' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses (409) a legacy flat path rather than signing it', async () => {
    getCurrentUser.mockResolvedValue(users.admin);
    const res = await call('file_legacy');
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'legacy_storage_path' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

describe('GET /api/hr/documents/[id]/download', () => {
  const HR_PATH = `tenants/${T}/employee-documents/emp_1/d1_passport.pdf`;
  const call = (id: string) =>
    hrDocumentDownload(new Request(`https://app.local/api/hr/documents/${id}/download`), {
      params: Promise.resolve({ id }),
    });

  beforeEach(() => {
    db.seed('employeeDocuments', [
      [
        'doc_1',
        {
          tenantId: T,
          userId: 'emp_1',
          fileName: 'passport.pdf',
          storagePath: HR_PATH,
          isDeleted: false,
        },
      ],
      [
        'doc_admin_hr',
        {
          tenantId: T,
          userId: 'emp_1',
          fileName: 'c.pdf',
          storagePath: `tenants/${T}/employees/emp_1/contract/d_c.pdf`,
          isDeleted: false,
        },
      ],
      [
        'doc_deleted',
        { tenantId: T, userId: 'emp_1', fileName: 'x.pdf', storagePath: HR_PATH, isDeleted: true },
      ],
      [
        'doc_foreign',
        {
          tenantId: OTHER,
          userId: 'emp_9',
          fileName: 'x.pdf',
          storagePath: `tenants/${OTHER}/employee-documents/emp_9/x.pdf`,
          isDeleted: false,
        },
      ],
      // An HR record pointed at a project file before P0-07 bound paths to surfaces.
      [
        'doc_cross_surface',
        {
          tenantId: T,
          userId: 'emp_1',
          fileName: 'x.pdf',
          storagePath: FILE_PATH,
          isDeleted: false,
        },
      ],
      [
        'doc_other_employee',
        {
          tenantId: T,
          userId: 'emp_1',
          fileName: 'x.pdf',
          storagePath: `tenants/${T}/employee-documents/emp_2/x.pdf`,
          isDeleted: false,
        },
      ],
    ]);
  });

  it('refuses a caller without HR access and mints nothing', async () => {
    requireHrAccess.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    expect((await call('doc_1')).status).toBe(403);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('mints for HR in the same tenant, from both HR surfaces', async () => {
    requireHrAccess.mockResolvedValue({ ok: true, user: users.hr });
    expect((await call('doc_1')).status).toBe(302);
    expect((await call('doc_admin_hr')).status).toBe(302);
  });

  it('is 404 for a deleted, missing or foreign-tenant document', async () => {
    requireHrAccess.mockResolvedValue({ ok: true, user: users.hr });
    for (const id of ['doc_deleted', 'doc_missing', 'doc_foreign']) {
      expect((await call(id)).status).toBe(404);
    }
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses a record whose path is another surface or another employee', async () => {
    requireHrAccess.mockResolvedValue({ ok: true, user: users.hr });
    expect((await call('doc_cross_surface')).status).toBe(409);
    expect((await call('doc_other_employee')).status).toBe(409);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

describe('GET /api/super_admin/tickets/[ticketId]/screenshot', () => {
  const SHOT = `tenants/${T}/support/ticket_1.jpg`;
  const LEGACY_TOKEN = 'LEGACY-SCREENSHOT-TOKEN';
  const call = (ticketId: string) =>
    screenshotDownload(
      new Request(`https://app.local/api/super_admin/tickets/${ticketId}/screenshot`) as never,
      { params: Promise.resolve({ ticketId }) },
    );

  beforeEach(() => {
    db.seed('platform_tickets', [
      ['ticket_1', { tenantId: T, screenshotPath: SHOT, screenshotUrl: null, hasScreenshot: true }],
      [
        'ticket_legacy',
        {
          tenantId: T,
          screenshotUrl: `https://firebasestorage.googleapis.com/v0/b/la-creativo-erp.firebasestorage.app/o/${encodeURIComponent(`tenants/${T}/support/ticket_legacy.png`)}?alt=media&token=${LEGACY_TOKEN}`,
          hasScreenshot: true,
        },
      ],
      ['ticket_forged', { tenantId: T, screenshotPath: FILE_PATH, hasScreenshot: true }],
      ['ticket_none', { tenantId: T, screenshotUrl: null, hasScreenshot: false }],
    ]);
  });

  it.each([
    ['Forbidden', 403],
    ['Unauthorized', 401],
  ])('refuses a non-super_admin (%s) and mints nothing', async (message, status) => {
    requireSuperAdmin.mockRejectedValue(new Error(message));
    expect((await call('ticket_1')).status).toBe(status);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('serves super_admin an inline short-lived URL for the ticket’s own object', async () => {
    requireSuperAdmin.mockResolvedValue(users.superAdmin);
    const res = await call('ticket_1');
    expect(res.status).toBe(302);
    const [[path, config]] = getSignedUrl.mock.calls;
    expect(path).toBe(SHOT);
    expect(config.responseDisposition).toMatch(/^inline;/);
  });

  it('serves a legacy ticket from its recovered path and never follows or returns the token', async () => {
    requireSuperAdmin.mockResolvedValue(users.superAdmin);
    const res = await call('ticket_legacy');
    expect(res.status).toBe(302);
    expect(getSignedUrl.mock.calls[0][0]).toBe(`tenants/${T}/support/ticket_legacy.png`);
    expect(res.headers.get('location')).not.toContain(LEGACY_TOKEN);
  });

  it('refuses a ticket whose stored path is not its own screenshot object', async () => {
    requireSuperAdmin.mockResolvedValue(users.superAdmin);
    expect((await call('ticket_forged')).status).toBe(404);
    expect((await call('ticket_none')).status).toBe(404);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

describe('mintProtectedDownloadUrl — the TTL and path invariants', () => {
  it('defaults to minutes, never days', async () => {
    const before = Date.now();
    await mintProtectedDownloadUrl({ storagePath: FILE_PATH, tenantId: T, fileName: 'a.pdf' });
    const { expires } = getSignedUrl.mock.calls[0][1];
    expect(expires - before).toBeLessThanOrEqual(PROTECTED_DOWNLOAD_TTL_MS + 50);
    expect(PROTECTED_DOWNLOAD_TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('clamps any requested TTL to the 15-minute ceiling', async () => {
    const before = Date.now();
    await mintProtectedDownloadUrl({
      storagePath: FILE_PATH,
      tenantId: T,
      fileName: 'a.pdf',
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    });
    const { expires } = getSignedUrl.mock.calls[0][1];
    expect(expires - before).toBeLessThanOrEqual(MAX_PROTECTED_DOWNLOAD_TTL_MS + 50);
    expect(MAX_PROTECTED_DOWNLOAD_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('refuses a path outside the caller tenant before signing', async () => {
    await expect(
      mintProtectedDownloadUrl({
        storagePath: `tenants/${OTHER}/projects/p/x.pdf`,
        tenantId: T,
        fileName: 'x.pdf',
      }),
    ).rejects.toBeInstanceOf(ProtectedDownloadRefused);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses a path outside the allowed roots, and an empty root list', async () => {
    for (const allowedRoots of [[`tenants/${T}/employees/`], [], [null]]) {
      await expect(
        mintProtectedDownloadUrl({
          storagePath: FILE_PATH,
          tenantId: T,
          fileName: 'x',
          allowedRoots,
        }),
      ).rejects.toMatchObject({ code: 'storage_path_mismatch' });
    }
    // A root is a prefix of a DEEPER object, never the object itself.
    await expect(
      mintProtectedDownloadUrl({
        storagePath: `tenants/${T}/projects/project_1/`,
        tenantId: T,
        fileName: 'x',
        allowedRoots: [`tenants/${T}/projects/project_1/`],
      }),
    ).rejects.toMatchObject({ code: 'storage_path_mismatch' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('builds a Content-Disposition header that cannot be broken by the file name', () => {
    const header = contentDisposition('evil"\r\nSet-Cookie: x=1.pdf', 'attachment');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(contentDisposition('résumé.pdf', 'inline')).toContain(
      "filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
    );
  });
});
