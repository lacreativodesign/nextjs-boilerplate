import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSalesManager, toISO } from '../../_utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection('leads')
      .where('tenantId', '==', auth.user.tenantId || '')
      .where('isDeleted', '==', false)
      .limit(500)
      .get();

    const leads = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: String(data.companyName || data.name || ''),
        email: String(data.contactEmail || data.email || ''),
        phone: String(data.contactPhone || data.phone || ''),
        source: String(data.source || ''),
        stage: String(data.stage || 'New Lead'),
        ownerId: data.ownerId || null,
        ownerName: data.ownerName || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({ ok: true, leads });
  } catch (err: any) {
    console.error('sales manager leads list error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to load leads.' }, { status: 500 });
  }
}
