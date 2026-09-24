/**
 * P0-07 — the two remaining signers behave as the invariant scans say they do.
 *
 *   - StorageService.getDownloadUrl() re-checks the document's tenant and deleted state
 *     ITSELF before minting, so a future caller that forgets the route's check still cannot
 *     sign another tenant's bytes.
 *   - An export job never stores its signed URL: the caller who ran the export gets a
 *     freshly minted one, and the job keeps only the storage path.
 */

import { Writable } from 'stream';

const mintProtectedDownloadUrl = jest.fn();
jest.mock('@/lib/storage/protected-download', () => ({
  ...jest.requireActual('@/lib/storage/protected-download'),
  mintProtectedDownloadUrl: (...args: unknown[]) => mintProtectedDownloadUrl(...args),
}));
jest.mock('@/lib/storage/bucket', () => ({ getStorageBucketName: () => 'bizosto-test-bucket' }));

const docs = new Map<string, Record<string, unknown>>();
const updates: Array<{ path: string; data: Record<string, unknown> }> = [];

function docRef(path: string) {
  return {
    id: path.split('/').pop(),
    get: async () => ({
      exists: docs.has(path),
      id: path.split('/').pop(),
      data: () => docs.get(path),
    }),
    update: async (data: Record<string, unknown>) => {
      updates.push({ path, data });
      docs.set(path, { ...(docs.get(path) || {}), ...data });
    },
  };
}

function rowsQuery(collection: string) {
  let served = false;
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => {
      const rows = served
        ? []
        : Array.from(docs.entries())
            .filter(([path]) => path.startsWith(`${collection}/`))
            .map(([path, data]) => ({ id: path.split('/').pop(), data: () => data }));
      served = true;
      return { empty: rows.length === 0, size: rows.length, docs: rows };
    },
  });
  return query;
}

const written: string[] = [];
jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
      ...rowsQuery(name),
    }),
  },
  adminStorage: {
    bucket: () => ({
      file: (path: string) => ({
        createWriteStream: () =>
          new Writable({
            write(_chunk, _enc, cb) {
              written.push(path);
              cb();
            },
          }),
      }),
    }),
  },
}));
jest.mock('firebase-admin', () => {
  class Timestamp {
    static now() {
      return new Timestamp();
    }
    toDate() {
      return new Date(0);
    }
  }
  return {
    firestore: {
      FieldPath: { documentId: () => '__name__' },
      FieldValue: { increment: (n: number) => ({ __increment: n }) },
      Timestamp,
    },
  };
});

import { StorageService } from '@/lib/storage/storage-service';
import { BulkExportService } from '@/lib/export/bulk-export';

beforeEach(() => {
  docs.clear();
  updates.length = 0;
  written.length = 0;
  mintProtectedDownloadUrl.mockReset().mockResolvedValue({
    url: 'https://signed.example/fresh',
    expiresAt: '2026-01-01T00:05:00.000Z',
  });
});

describe('StorageService.getDownloadUrl', () => {
  it('mints for the owning tenant, bound to that tenant', async () => {
    docs.set('documents/d1', {
      tenantId: 'tenant_a',
      storagePath: 'tenants/tenant_a/documents/x.pdf',
      originalFileName: 'x.pdf',
      deletedAt: null,
    });
    await expect(StorageService.getDownloadUrl('d1', 'tenant_a')).resolves.toBe(
      'https://signed.example/fresh',
    );
    expect(mintProtectedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: 'tenants/tenant_a/documents/x.pdf',
        tenantId: 'tenant_a',
      }),
    );
  });

  it("refuses another tenant's document before minting", async () => {
    docs.set('documents/d1', {
      tenantId: 'tenant_b',
      storagePath: 'tenants/tenant_b/documents/x.pdf',
    });
    await expect(StorageService.getDownloadUrl('d1', 'tenant_a')).rejects.toThrow(/not found/);
    expect(mintProtectedDownloadUrl).not.toHaveBeenCalled();
  });

  it('refuses a deleted document before minting', async () => {
    docs.set('documents/d1', {
      tenantId: 'tenant_a',
      storagePath: 'tenants/tenant_a/documents/x.pdf',
      deletedAt: { seconds: 1 },
    });
    await expect(StorageService.getDownloadUrl('d1', 'tenant_a')).rejects.toThrow(/not found/);
    expect(mintProtectedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('BulkExportService.runExportJob', () => {
  it('returns a freshly minted URL and stores none on the job', async () => {
    docs.set('exportJobs/j1', {
      tenantId: 'tenant_a',
      entity: 'clients',
      format: 'csv',
      fields: [{ label: 'Name', sourceField: 'name' }],
      filters: [],
    });
    docs.set('clients/c1', { tenantId: 'tenant_a', name: 'Acme' });

    const result = await BulkExportService.runExportJob({ jobId: 'j1', tenantId: 'tenant_a' });

    expect(result.signedUrl).toBe('https://signed.example/fresh');
    expect(mintProtectedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_a',
        allowedRoots: ['tenants/tenant_a/exports/'],
      }),
    );
    const job = docs.get('exportJobs/j1')!;
    expect(job.status).toBe('completed');
    expect(String(job.storagePath)).toMatch(/^tenants\/tenant_a\/exports\/clients\//);
    // The job never holds a URL: not the fresh one, not any other.
    expect(job.signedUrl).toBeNull();
    expect(JSON.stringify(updates)).not.toContain('signed.example');
  });
});
