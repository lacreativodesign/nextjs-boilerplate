/**
 * P0-07 — the six browser-direct registration routes no longer trust or persist a
 * caller-supplied download URL, revoke the upload-time Firebase token, and only register an
 * object that belongs to the surface and resource being registered.
 *
 * Same real handlers and Firestore/Storage doubles as storage-quota-upload-routes.test.ts
 * (whose harness this reuses), so every assertion executes the route rather than reading it.
 */

import { FakeDb } from '../lib/test-utils/firestore-quota-double';

const GB = 1024 ** 3;
const STARTER_LIMIT = 20 * GB;
const TENANT = 'tenant_a';
const PROJECT = 'project_1';
const EMPLOYEE = 'employee_1';

let db: FakeDb;
const getMetadata = jest.fn();
const setMetadata = jest.fn();
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
          setMetadata: (metadata: unknown, options: unknown) =>
            setMetadata(storagePath, metadata, options),
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

// P0-07: product storage fails closed without a configured bucket (lib/storage/product-bucket.ts).
process.env.FIREBASE_STORAGE_BUCKET = 'bizosto-test-bucket';

import { POST as clientUpload } from '@/app/api/client/files/upload/route';
import { POST as amUpload } from '@/app/api/am/files/upload/route';
import { POST as productionUpload } from '@/app/api/production/files/upload/route';
import { POST as adminCreate } from '@/app/api/admin/files/create/route';
import { POST as hrUpload } from '@/app/api/hr/documents/upload/route';
import { POST as adminHrUpload } from '@/app/api/admin/hr/documents/upload/route';
import { STORAGE_LIMIT_EXCEEDED } from '@/lib/billing/storage-limit';
import { getTenantStorageUsage } from '@/lib/billing/storage-limit';
import {
  createNotification,
  createNotificationEvent,
  getUserIdsByRoles,
} from '@/lib/notifications';
import { logActivity } from '@/lib/activity/tracker';

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
  /** Paths inside the caller's tenant that are NOT this surface's object (P0-07). */
  foreign?: string[];
}> = [
  {
    name: 'client files',
    foreign: [
      `tenants/${TENANT}/projects/${PROJECT}/design/f1_brief.pdf`,
      `tenants/${TENANT}/client-files/other_project/f1_brief.pdf`,
    ],
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
    foreign: [
      `tenants/${TENANT}/projects/other_project/design/f1_brief.pdf`,
      `tenants/${TENANT}/employee-documents/${EMPLOYEE}/d1_passport.pdf`,
      `tenants/${TENANT}/client-files/${PROJECT}/f1_brief.pdf`,
    ],
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
    foreign: [
      `tenants/${TENANT}/projects/other_project/design/f1_brief.pdf`,
      `tenants/${TENANT}/employee-documents/${EMPLOYEE}/d1_passport.pdf`,
      `tenants/${TENANT}/client-files/${PROJECT}/f1_brief.pdf`,
    ],
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
    foreign: [
      `tenants/${TENANT}/projects/other_project/design/f1_brief.pdf`,
      `tenants/${TENANT}/employee-documents/${EMPLOYEE}/d1_passport.pdf`,
      `tenants/${TENANT}/client-files/${PROJECT}/f1_brief.pdf`,
    ],
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
    foreign: [
      `tenants/${TENANT}/projects/${PROJECT}/design/f1_brief.pdf`,
      `tenants/${TENANT}/employee-documents/someone_else/d1_passport.pdf`,
      `tenants/${TENANT}/employees/${EMPLOYEE}/contract/d1_contract.pdf`,
    ],
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
    foreign: [
      `tenants/${TENANT}/projects/${PROJECT}/design/f1_brief.pdf`,
      `tenants/${TENANT}/employees/someone_else/contract/d1_contract.pdf`,
      `tenants/${TENANT}/employee-documents/${EMPLOYEE}/d1_contract.pdf`,
    ],
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

  getMetadata.mockReset().mockResolvedValue([{ size: MEASURED, generation: '1700000000000001' }]);
  deleteObject.mockReset().mockResolvedValue(undefined);
  setMetadata.mockReset();

  // Reset the downstream collaborators too: a `mockRejectedValueOnce` queued by one test
  // and not consumed leaks into the next, which makes a real failure look like a flake.
  (createNotification as jest.Mock).mockReset().mockResolvedValue(undefined);
  (createNotificationEvent as jest.Mock).mockReset().mockResolvedValue(undefined);
  (getUserIdsByRoles as jest.Mock).mockReset().mockResolvedValue([]);
  (logActivity as jest.Mock).mockReset().mockResolvedValue(undefined);
});

const SECRET_TOKEN = 'SECRET-TOKEN-VALUE-p0-07';
const ATTACKER_URL =
  'https://firebasestorage.googleapis.com/v0/b/evil/o/x?alt=media&token=attacker-chosen';

const liveRecords = (collection: string) =>
  Array.from(db.bucket(collection).values()).filter((row) => row.tenantId === TENANT);

describe.each(SURFACES)('P0-07: $name', ({ handler, collection, storagePath, body, foreign }) => {
  it('never persists the caller-supplied downloadUrl; the record keeps the storagePath', async () => {
    const response = await handler(jsonRequest(body({ downloadUrl: ATTACKER_URL })));
    expect(response.status).toBe(200);

    const records = liveRecords(collection);
    expect(records).toHaveLength(1);
    expect(records[0].storagePath).toBe(storagePath);
    expect(records[0].downloadUrl).toBeNull();
    expect(JSON.stringify(records[0])).not.toContain('attacker-chosen');
  });

  it('registers without any downloadUrl at all (it is no longer a required field)', async () => {
    const withoutUrl = body({});
    delete withoutUrl.downloadUrl;
    const response = await handler(jsonRequest(withoutUrl));
    expect(response.status).toBe(200);
    expect(liveRecords(collection)).toHaveLength(1);
  });

  it('revokes the upload-time Firebase token, bound to the measured generation, before registering', async () => {
    getMetadata.mockResolvedValue([
      {
        size: MEASURED,
        generation: '1700000000000001',
        metageneration: '1',
        metadata: { firebaseStorageDownloadTokens: SECRET_TOKEN },
      },
    ]);
    setMetadata.mockResolvedValue([
      { generation: '1700000000000001', metageneration: '2', metadata: {} },
    ]);

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(200);
    expect(setMetadata).toHaveBeenCalledWith(
      storagePath,
      { metadata: { firebaseStorageDownloadTokens: null } },
      { ifGenerationMatch: '1700000000000001', ifMetagenerationMatch: '1' },
    );
    expect(liveRecords(collection)).toHaveLength(1);
    const text = await response.text();
    expect(text).not.toContain(SECRET_TOKEN);
  });

  it('refuses to register (502) when the token cannot be revoked, deletes nothing, holds no quota', async () => {
    getMetadata.mockResolvedValue([
      {
        size: MEASURED,
        generation: '1700000000000001',
        metageneration: '1',
        metadata: { firebaseStorageDownloadTokens: SECRET_TOKEN },
      },
    ]);
    setMetadata.mockRejectedValue(Object.assign(new Error('backend'), { code: 503 }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(502);
    expect(liveRecords(collection)).toHaveLength(0);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(db.bucket(`tenant_storage_ledgers/${TENANT}/reservations`).size).toBe(0);
    log.mockRestore();
  });

  it('refuses to register when Cloud Storage still reports the token after the PATCH', async () => {
    const tokenized = {
      size: MEASURED,
      generation: '1700000000000001',
      metageneration: '1',
      metadata: { firebaseStorageDownloadTokens: SECRET_TOKEN },
    };
    getMetadata.mockResolvedValue([tokenized]);
    setMetadata.mockResolvedValue([{ ...tokenized, metageneration: '2' }]);

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(502);
    expect(liveRecords(collection)).toHaveLength(0);
  });

  it('answers 409 and touches nothing when the object changed generation mid-registration', async () => {
    getMetadata
      .mockResolvedValueOnce([{ size: MEASURED, generation: '1700000000000001' }])
      .mockResolvedValue([
        {
          size: MEASURED,
          generation: '1700000000000009',
          metageneration: '1',
          metadata: { firebaseStorageDownloadTokens: SECRET_TOKEN },
        },
      ]);

    const response = await handler(jsonRequest(body({})));
    expect(response.status).toBe(409);
    expect(setMetadata).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(liveRecords(collection)).toHaveLength(0);
  });

  it.each(foreign ?? [])(
    'refuses to register %s — an object of another surface or resource',
    async (foreignPath) => {
      const response = await handler(jsonRequest(body({ storagePath: foreignPath })));
      expect(response.status).toBe(400);
      // Refused before the object is measured, reserved, stripped or recorded.
      expect(getMetadata).not.toHaveBeenCalled();
      expect(setMetadata).not.toHaveBeenCalled();
      expect(liveRecords(collection)).toHaveLength(0);
    },
  );
});
