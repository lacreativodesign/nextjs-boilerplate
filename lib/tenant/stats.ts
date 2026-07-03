import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';

export async function incrementTenantStats(
  tenantId: string,
  counters: {
    invoicesCreated?: number;
    invoiceAmountTotalBaseDelta?: number;
  },
) {
  if (!tenantId) return;

  const statsRef = adminDb.collection('tenant_stats').doc(tenantId);
  await statsRef.set(
    {
      tenantId,
      invoicesCreated: admin.firestore.FieldValue.increment(counters.invoicesCreated ?? 0),
      invoiceAmountTotalBase: admin.firestore.FieldValue.increment(
        counters.invoiceAmountTotalBaseDelta ?? 0,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
