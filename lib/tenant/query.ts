import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from '@/lib/tenant';

export async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const queries = [query.where('tenantId', '==', normalizedTenantId)];
  if (normalizedTenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where('tenantId', '==', null));
  }
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === normalizedTenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}
