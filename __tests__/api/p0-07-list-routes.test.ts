/**
 * P0-07 — list APIs never hand out a stored bearer URL.
 *
 * Legacy records still carry a Firebase `downloadUrl` (a permanent token), a 2-day or
 * 7-day signed `previewUrl` / `storageUrl`, or a tokenized `screenshotUrl`. Every list
 * below is driven with such records through its real handler, and the response must
 * contain none of those values — only a same-origin route that authorizes per request.
 */

import { NextRequest } from 'next/server';
import { FakeDb } from '../lib/test-utils/firestore-quota-double';

let db: FakeDb;
const TOKEN = 'LEGACY-BEARER-TOKEN-p007';
const LEGACY = `https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=${TOKEN}`;
const T = 'tenant_a';

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return db;
  },
}));

const getCurrentUser = jest.fn();
const requireClient = jest.fn();
const requireHrAccess = jest.fn();
const getAmUser = jest.fn();
const getProductionUser = jest.fn();
const requireSuperAdmin = jest.fn();

jest.mock('@/app/api/admin/_utils', () => ({
  ...jest.requireActual('@/app/api/admin/_utils'),
  getCurrentUser: () => getCurrentUser(),
}));
jest.mock('@/app/api/client/_utils', () => ({
  ...jest.requireActual('@/app/api/client/_utils'),
  requireClient: () => requireClient(),
}));
jest.mock('@/app/api/admin/hr/_utils', () => ({
  ...jest.requireActual('@/app/api/admin/hr/_utils'),
  requireHrAccess: () => requireHrAccess(),
}));
jest.mock('@/app/api/am/_utils', () => ({
  ...jest.requireActual('@/app/api/am/_utils'),
  getAmUser: () => getAmUser(),
}));
jest.mock('@/app/api/production/_utils', () => ({
  ...jest.requireActual('@/app/api/production/_utils'),
  getProductionUser: () => getProductionUser(),
}));
jest.mock('@/app/api/super_admin/_utils', () => ({
  requireSuperAdmin: (req: unknown) => requireSuperAdmin(req),
}));

import { GET as hrList } from '@/app/api/hr/documents/list/route';
import { GET as adminHrList } from '@/app/api/admin/hr/documents/list/route';
import { GET as clientFilesList } from '@/app/api/client/files/list/route';
import { GET as clientProjectGet } from '@/app/api/client/projects/get/route';
import { GET as amFilesList } from '@/app/api/am/files/list/route';
import { GET as adminFilesList } from '@/app/api/admin/files/list/route';
import { GET as productionFilesList } from '@/app/api/production/files/list/route';
import { GET as adminProductionFilesList } from '@/app/api/admin/production/files/list/route';
import { GET as managedFilesList } from '@/app/api/files/route';
import { GET as superAdminTickets } from '@/app/api/super_admin/tickets/route';
import { FileManager } from '@/lib/files/file-manager';

const legacyFile = (over: Record<string, unknown> = {}) => ({
  tenantId: T,
  projectId: 'p1',
  clientId: 'c1',
  fileName: 'brief.pdf',
  category: 'Draft',
  storagePath: `tenants/${T}/projects/p1/Draft/f_brief.pdf`,
  downloadUrl: LEGACY,
  isDeleted: false,
  isLatest: true,
  uploadedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db = new FakeDb();
  db.seed('files', [['file_1', legacyFile()]]);
  db.seed('projects', [
    [
      'p1',
      { tenantId: T, clientId: 'c1', ownerAmUid: 'am1', productionUid: 'prod1', isDeleted: false },
    ],
  ]);
});

async function body(res: Response) {
  const text = await res.text();
  expect(res.status).toBe(200);
  // The whole point: no stored credential anywhere in the payload.
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain('"downloadUrl"');
  return JSON.parse(text);
}

describe('project file lists return downloadHref, never the stored URL', () => {
  const href = '/api/project-files/file_1/download';

  it('client files list', async () => {
    requireClient.mockResolvedValue({
      ok: true,
      user: { uid: 'u', tenantId: T },
      clientId: 'c1',
      tenantId: T,
    });
    const json = await body(await clientFilesList());
    expect(json.files[0]).toMatchObject({ id: 'file_1', downloadHref: href });
  });

  it('client project detail', async () => {
    requireClient.mockResolvedValue({
      ok: true,
      user: { uid: 'u', tenantId: T },
      clientId: 'c1',
      tenantId: T,
    });
    const res = await clientProjectGet(
      new NextRequest('https://app.local/api/client/projects/get?id=p1'),
    );
    const json = await body(res);
    expect(json.files[0]).toMatchObject({ id: 'file_1', downloadHref: href });
  });

  it('AM files list', async () => {
    getAmUser.mockResolvedValue({ uid: 'am1', role: 'am', tenantId: T });
    const json = await body(await amFilesList(new Request('https://app.local/api/am/files/list')));
    expect(json.files[0]).toMatchObject({ id: 'file_1', downloadHref: href });
  });

  it('admin files list', async () => {
    getCurrentUser.mockResolvedValue({ uid: 'a1', role: 'admin', tenantId: T });
    const json = await body(
      await adminFilesList(new Request('https://app.local/api/admin/files/list')),
    );
    expect(json.files[0]).toMatchObject({ id: 'file_1', downloadHref: href });
  });

  it('production files list', async () => {
    getProductionUser.mockResolvedValue({ uid: 'prod1', role: 'production', tenantId: T });
    const json = await body(
      await productionFilesList(
        new Request('https://app.local/api/production/files/list?projectId=p1'),
      ),
    );
    expect(json.files[0]).toMatchObject({ id: 'file_1', downloadHref: href });
  });

  it('admin production files list', async () => {
    getCurrentUser.mockResolvedValue({ uid: 'a1', role: 'admin', tenantId: T });
    const json = await body(
      await adminProductionFilesList(
        new Request('https://app.local/api/admin/production/files/list?projectId=p1'),
      ),
    );
    expect(json.files[0]).toMatchObject({ id: 'file_1', downloadHref: href });
  });
});

describe('HR document lists strip the stored URL before spreading the record', () => {
  beforeEach(() => {
    db.seed('employeeDocuments', [
      [
        'doc_1',
        {
          tenantId: T,
          userId: 'emp_1',
          fileName: 'passport.pdf',
          storagePath: `tenants/${T}/employee-documents/emp_1/d_passport.pdf`,
          downloadUrl: LEGACY,
          isDeleted: false,
        },
      ],
    ]);
    requireHrAccess.mockResolvedValue({ ok: true, user: { uid: 'hr1', role: 'hr', tenantId: T } });
  });

  it.each([
    ['/hr/documents', hrList],
    ['/admin/hr/documents', adminHrList],
  ])('%s', async (_label, handler) => {
    const json = await body(await handler());
    expect(json.documents[0]).toMatchObject({
      id: 'doc_1',
      fileName: 'passport.pdf',
      downloadHref: '/api/hr/documents/doc_1/download',
    });
  });
});

describe('managed file list: ACL-filtered, and no stored preview URL', () => {
  const file = (id: string, permissions: Record<string, unknown>, uploadedBy = 'someone') => ({
    id,
    tenantId: T,
    name: `${id}.pdf`,
    path: `${id}.pdf`,
    tags: [],
    uploadedBy,
    storagePath: `tenants/${T}/files/${id}/v1-x.pdf`,
    previewUrl: `https://storage.googleapis.com/x?X-Goog-Signature=${TOKEN}`,
    permissions,
  });

  it('returns only files the caller may open, without previewUrl', async () => {
    jest
      .spyOn(FileManager, 'listFiles')
      .mockResolvedValue([
        file('team', { visibility: 'team', allowedRoles: [], allowedUsers: [] }),
        file('private_other', { visibility: 'private', allowedRoles: [], allowedUsers: [] }),
        file(
          'private_mine',
          { visibility: 'private', allowedRoles: [], allowedUsers: [] },
          'u_sales',
        ),
        file('shared_role', { visibility: 'private', allowedRoles: ['sales'], allowedUsers: [] }),
        file('shared_user', { visibility: 'private', allowedRoles: [], allowedUsers: ['u_sales'] }),
      ] as never);
    getCurrentUser.mockResolvedValue({ uid: 'u_sales', role: 'sales', tenantId: T });

    const res = await managedFilesList(new Request('https://app.local/api/files'));
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
    const ids = JSON.parse(text).files.map((f: { id: string }) => f.id);
    expect(ids).toEqual(['team', 'private_mine', 'shared_role', 'shared_user']);
  });

  it('gives a tenant admin every file', async () => {
    jest
      .spyOn(FileManager, 'listFiles')
      .mockResolvedValue([
        file('private_other', { visibility: 'private', allowedRoles: [], allowedUsers: [] }),
      ] as never);
    getCurrentUser.mockResolvedValue({ uid: 'a1', role: 'admin', tenantId: T });
    const json = await (await managedFilesList(new Request('https://app.local/api/files'))).json();
    expect(json.files).toHaveLength(1);
  });
});

describe('super_admin ticket queue', () => {
  it('replaces locators with the authorized screenshot route', async () => {
    db.seed('platform_tickets', [
      ['t1', { tenantId: T, title: 'old', screenshotUrl: LEGACY, hasScreenshot: true }],
    ]);
    requireSuperAdmin.mockResolvedValue({ uid: 'op', role: 'super_admin' });
    const res = await superAdminTickets(
      new Request('https://app.local/api/super_admin/tickets') as never,
    );
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
    expect(JSON.parse(text).tickets[0]).toMatchObject({
      hasScreenshot: true,
      screenshotHref: '/api/super_admin/tickets/t1/screenshot',
    });
  });
});
