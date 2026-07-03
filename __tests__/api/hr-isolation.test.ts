import { FirestoreEmulator } from './test-utils/firestore-emulator';
import { jsonRequest } from './test-utils/request';

const db = new FirestoreEmulator({
  employeeDocuments: [
    { id: 'doc_a', data: { tenantId: 'tenant_a', name: 'A Doc', isDeleted: false } },
    { id: 'doc_b', data: { tenantId: 'tenant_b', name: 'B Doc', isDeleted: false } },
  ],
});

const requireHrAccess = jest.fn(async () => ({
  ok: true as const,
  user: { uid: 'hr_a', tenantId: 'tenant_a', role: 'hr', name: 'HR A', email: 'hr@example.com' },
}));

jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: db }));
jest.mock('@/lib/activity/tracker', () => ({ logActivity: jest.fn() }));
jest.mock('@/app/api/admin/hr/_utils', () => ({
  requireHrAccess,
  createHrEvent: jest.fn(async () => undefined),
  serverTimestamp: () => new Date('2025-01-01T00:00:00.000Z'),
}));

describe('hr tenant isolation', () => {
  it('prevents tenant A from deleting tenant B document', async () => {
    const route = await import('@/app/api/admin/hr/documents/delete/route');
    const res = await route.POST(
      jsonRequest('https://app.local/api/admin/hr/documents/delete', { docId: 'doc_b' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns unauthorized on missing hr auth', async () => {
    requireHrAccess.mockResolvedValueOnce({ ok: false, status: 401, error: 'Unauthorized' } as any);
    const route = await import('@/app/api/admin/hr/documents/delete/route');
    const res = await route.POST(
      jsonRequest('https://app.local/api/admin/hr/documents/delete', { docId: 'doc_a' }),
    );
    expect(res.status).toBe(401);
  });
});
