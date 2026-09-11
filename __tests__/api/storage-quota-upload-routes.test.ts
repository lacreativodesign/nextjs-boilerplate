/**
 * PR4-C — the six browser-direct upload routes spend the tenant's real quota.
 *
 * These routes do not stream bytes. The browser writes the object to Cloud Storage with
 * the client SDK and then POSTs a body that merely DESCRIBES it, including a `size` the
 * routes used to meter the tenant with. A caller declaring `size: 0` therefore stored a
 * real object for free, repeatedly.
 *
 * Each route now measures the object through the Admin SDK, reserves exactly that many
 * bytes, persists the measured figure, removes the object when the tenant has no room,
 * and releases its reservation on every path. These tests drive the real handlers so
 * that wiring is executed per route rather than asserted about from the source text —
 * six identical-looking call sites is exactly where a copy-paste slip hides.
 */

import { FakeDb } from '../lib/test-utils/firestore-quota-double';

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const TENANT = 'tenant_a';
const PROJECT = 'project_1';
const EMPLOYEE = 'employee_1';

let db: FakeDb;
const getMetadata = jest.fn();
const deleteObject = jest.fn();

const clientUser = {
  ok: true as const,
  user: { uid: 'client_1', tenantId: TENANT, role: 'client', name: 'Client One' },
  clientId: 'client_co',
};
const amUser = { uid: 'am_1', tenantId: TENANT, role: 'am', name: 'AM One' };
const productionUser = { uid: 'prod_1', tenantId: TENANT, role: 'production', name: 'Prod One' };
const adminUser = { uid: 'admin_1', tenantId: TENANT, role: 'admin', name: 'Admin One' };
const hrAccess = {
  ok: true as const,
  user: { uid: 'hr_1', tenantId: TENANT, role: 'hr', name: 'HR One', email: 'hr@example.com' },
};

jest.mock('firebase-admin/firestore', () => ({
  AggregateField: { sum: (field: string) => ({ __sum: field }) },
}));

jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
  firestore: { FieldValue: { serverTimestamp: () => 'ts' } },
}));

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
  get adminStorage() {
    return {
      bucket: () => ({
        file: (storagePath: string) => ({
          getMetadata: () => getMetadata(storagePath),
          delete: (options?: unknown) => deleteObject(storagePath, options),
        }),
      }),
    };
  },
}));

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(async () => undefined),
  createNotificationEvent: jest.fn(async () => undefined),
  getUserIdsByRoles: jest.fn(async () => []),
}));
jest.mock('@/lib/activity/tracker', () => ({ logActivity: jest.fn(async () => undefined) }));

jest.mock('@/app/api/client/_utils', () => ({ requireClient: jest.fn(async () => clientUser) }));
jest.mock('@/app/api/am/_utils', () => ({
  getAmUser: jest.fn(async () => amUser),
  isOwnedByAm: jest.fn(() => true),
}));
jest.mock('@/app/api/production/_utils', () => ({
  getProductionUser: jest.fn(async () => productionUser),
  isAssignedToProduction: jest.fn(() => true),
}));
jest.mock('@/app/api/admin/_utils', () => ({
  getCurrentUser: jest.fn(async () => adminUser),
  isAdminOrSuper: jest.fn(() => true),
  isAccountManager: jest.fn(() => false),
  isProduction: jest.fn(() => false),
  isSalesManager: jest.fn(() => false),
}));
jest.mock('@/app/api/hr/_utils', () => ({
  requireHrAccess: jest.fn(async () => hrAccess),
  createHrEvent: jest.fn(async () => undefined),
  createHrNotification: jest.fn(async () => undefined),
  getRouteForRole: jest.fn(() => '/hr'),
  serverTimestamp: jest.fn(() => 'ts'),
}));
jest.mock('@/app/api/admin/hr/_utils', () => ({
  requireHrAccess: jest.fn(async () => hrAccess),
  createHrEvent: jest.fn(async () => undefined),
  serverTimestamp: jest.fn(() => 'ts'),
}));

import { POST as clientUpload } from '@/app/api/client/files/upload/route';
import { POST as amUpload } from '@/app/api/am/files/upload/route';
import { POST as productionUpload } from '@/app/api/production/files/upload/route';
import { POST as adminCreate } from '@/app/api/admin/files/create/route';
import { POST as hrUpload } from '@/app/api/hr/documents/upload/route';
import { POST as adminHrUpload } from '@/app/api/admin/hr/documents/upload/route';
import { STORAGE_LIMIT_EXCEEDED } from '@/lib/billing/storage-limit';

const jsonRequest = (body: unknown) =>
  new Request('https://bizosto.test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const projectPath = `tenants/${TENANT}/projects/${PROJECT}/design/f1_brief.pdf`;
const clientPath = `tenants/${TENANT}/client-files/${PROJECT}/f1_brief.pdf`;
const employeePath = `tenants/${TENANT}/employees/${EMPLOYEE}/contract/d1_contract.pdf`;
const employeeDocPath = `tenants/${TENANT}/employee-documents/${EMPLOYEE}/d1_contract.pdf`;

/**
 * Every surface: the handler, a valid body, the collection its record lands in, and the
 * path the browser claims to have written to.
 */
const SURFACES: Array<{
  name: string;
  handler: (req: Request) => Promise<Response>;
  collection: string;
  storagePath: string;
  body: (over: Record<string, unknown>) => Record<string, unknown>;
}> = [
  {
    name: 'client files',
    handler: clientUpload,
    collection: 'files',
    storagePath: clientPath,
    body: (over) => ({
      projectId: PROJECT,
      fileName: 'brief.pdf',
      storagePath: clientPath,
      downloadUrl: 'https://example.test/brief.pdf',
      size: 10,
      ...over,
    }),
  },
  {
    name: 'AM files',
    handler: amUpload,
    collection: 'files',
    storagePath: projectPath,
    body: (over) => ({
      projectId: PROJECT,
      category: 'Draft',
      fileName: 'brief.pdf',
      storagePath: projectPath,
      downloadUrl: 'https://example.test/brief.pdf',
      size: 10,
      ...over,
    }),
  },
  {
    name: 'production files',
    handler: productionUpload,
    collection: 'files',
    storagePath: projectPath,
    body: (over) => ({
      projectId: PROJECT,
      category: 'Draft',
      fileName: 'brief.pdf',
      storagePath: projectPath,
      downloadUrl: 'https://example.test/brief.pdf',
      size: 10,
      ...over,
    }),
  },
  {
    name: 'admin project files',
    handler: adminCreate,
    collection: 'files',
    storagePath: projectPath,
    body: (over) => ({
      projectId: PROJECT,
      category: 'Draft',
      fileName: 'brief.pdf',
      storagePath: projectPath,
      downloadUrl: 'https://example.test/brief.pdf',
      size: 10,
      ...over,
    }),
  },
  {
    name: 'HR documents',
    handler: hrUpload,
    collection: 'employeeDocuments',
    storagePath: employeeDocPath,
    body: (over) => ({
      userId: EMPLOYEE,
      docType: 'contract',
      fileName: 'contract.pdf',
      storagePath: employeeDocPath,
      downloadUrl: 'https://example.test/contract.pdf',
      size: 10,
      ...over,
    }),
  },
  {
    name: 'admin HR documents',
    handler: adminHrUpload,
    collection: 'employeeDocuments',
    storagePath: employeePath,
    body: (over) => ({
      userId: EMPLOYEE,
      docType: 'contract',
      fileName: 'contract.pdf',
      storagePath: employeePath,
      downloadUrl: 'https://example.test/contract.pdf',
      size: 10,
      ...over,
    }),
  },
];

const MEASURED = 5 * 1024 * 1024; // 5MB actually in the bucket

beforeEach(() => {
  db = new FakeDb();
  db.seed('tenants', [[TENANT, { plan: 'starter' }]]);
  db.seed('projects', [
    [
      PROJECT,
      {
        tenantId: TENANT,
        clientId: clientUser.clientId,
        projectName: 'Launch',
        ownerAmUid: amUser.uid,
        productionUid: productionUser.uid,
        isDeleted: false,
      },
    ],
  ]);
  db.seed('users', [[EMPLOYEE, { tenantId: TENANT, role: 'sales' }]]);

  getMetadata.mockReset().mockResolvedValue([{ size: MEASURED }]);
  deleteObject.mockReset().mockResolvedValue(undefined);
});

describe.each(SURFACES)('PR4-C: $name', ({ handler, collection, storagePath, body }) => {
  const liveRecords = () =>
    Array.from(db.bucket(collection).values()).filter((row) => row.tenantId === TENANT);

  it('persists the size Cloud Storage recorded, not the size the caller declared', async () => {
    const response = await handler(jsonRequest(body({ size: 0 })));
    expect(response.status).toBe(200);

    const records = liveRecords();
    expect(records).toHaveLength(1);
    // The caller declared nothing; the bucket says 5MB, and 5MB is what is metered.
    expect(records[0].size).toBe(MEASURED);
    expect(getMetadata).toHaveBeenCalledWith(storagePath);
  });

  it('refuses with the quota contract when the tenant has no room', async () => {
    db.seed('documents', [
      ['bulky', { tenantId: TENANT, fileSize: STARTER_LIMIT, deletedAt: null }],
    ]);

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: STORAGE_LIMIT_EXCEEDED,
      limit: STARTER_LIMIT,
    });

    expect(liveRecords()).toHaveLength(0);
  });

  it('removes the already-uploaded object when it refuses', async () => {
    db.seed('documents', [
      ['bulky', { tenantId: TENANT, fileSize: STARTER_LIMIT, deletedAt: null }],
    ]);

    await handler(jsonRequest(body({})));
    // The bytes are already in the bucket; a refusal that left them would bill Bizosto
    // for an orphan no record points at.
    expect(deleteObject).toHaveBeenCalledWith(storagePath, { ignoreNotFound: true });
  });

  it('refuses an object that is not in the bucket at all', async () => {
    getMetadata.mockRejectedValue(new Error('No such object'));

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(400);
    expect(liveRecords()).toHaveLength(0);
  });

  it('refuses an object larger than the app ceiling and removes it', async () => {
    // Storage rules stop at 50MB per object; the app ceiling is 25MB, and the declared
    // size is the only thing the earlier validation ever saw.
    getMetadata.mockResolvedValue([{ size: 40 * 1024 * 1024 }]);

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(400);
    expect(deleteObject).toHaveBeenCalledWith(storagePath, { ignoreNotFound: true });
    expect(liveRecords()).toHaveLength(0);
  });

  it('releases its reservation on success and on refusal', async () => {
    await handler(jsonRequest(body({})));
    expect(db.bucket(`tenant_storage_ledgers/${TENANT}/reservations`).size).toBe(0);

    db.seed('documents', [
      ['bulky', { tenantId: TENANT, fileSize: STARTER_LIMIT, deletedAt: null }],
    ]);
    await handler(jsonRequest(body({})));
    expect(db.bucket(`tenant_storage_ledgers/${TENANT}/reservations`).size).toBe(0);
  });

  it('rejects a storage path outside the caller’s tenant before measuring it', async () => {
    const response = await handler(
      jsonRequest(body({ storagePath: `tenants/tenant_b/projects/${PROJECT}/x_f.pdf` })),
    );

    expect(response.status).toBe(400);
    expect(getMetadata).not.toHaveBeenCalled();
    expect(liveRecords()).toHaveLength(0);
  });
});
