import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../_utils';
import { generateInvoiceToken } from '@/lib/finance/invoiceToken';

export const runtime = 'nodejs';

const PAGE_SIZE = 400;

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    let scanned = 0;
    let stamped = 0;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (true) {
      let query = adminDb.collection('invoices').orderBy('__name__').limit(PAGE_SIZE);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snap = await query.get();
      if (snap.empty) break;

      const batch = adminDb.batch();
      let batchCount = 0;

      for (const doc of snap.docs) {
        scanned += 1;
        const data = doc.data() || {};
        const hasPaymentToken =
          typeof data.paymentToken === 'string' && data.paymentToken.length > 0;
        const hasPublicToken = typeof data.publicToken === 'string' && data.publicToken.length > 0;
        if (hasPaymentToken || hasPublicToken) continue;

        batch.set(doc.ref, { paymentToken: generateInvoiceToken() }, { merge: true });
        batchCount += 1;
        stamped += 1;
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE_SIZE) break;
    }

    return NextResponse.json({ ok: true, scanned, stamped });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
