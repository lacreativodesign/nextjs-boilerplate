import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { canWriteSales, isSales, requireSalesRead, toISO } from '../../_utils';

export const dynamic = 'force-dynamic';

type LeadDoc = {
  tenantId?: string;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  company?: string;
  name?: string;
  email?: string;
  phone?: string;
  disposition?: string;
  expectedValueUsd?: number;
  packageName?: string;
  interestedServices?: string[];
  probability?: number;
  lastContactedAt?: any;
  nextFollowUpAt?: any;
  source?: string;
  notes?: string;
  status?: string;
  stage?: string;
  ownerUid?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  lastActivityAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where('tenantId', '==', tenantId)];
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

export async function GET(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || '';
    const salesRep = isSales(role);
    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 403 });
    }
    const tenantId = normalizeTenantId(auth.user.tenantId);
    const { searchParams } = new URL(req.url);
    const cursor = String(searchParams.get('cursor') || '').trim();
    const rawLimit = Number(searchParams.get('limit') || 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 50;

    let cursorDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (cursor) {
      const doc = await adminDb.collection('leads').doc(cursor).get();
      if (doc.exists) {
        cursorDoc = doc;
      }
    }

    const applyCursor = (query: FirebaseFirestore.Query) => {
      if (!cursorDoc) return query;
      return query.startAfter(cursorDoc);
    };

    const [ownerDocs, createdDocs, unassignedDocs] = salesRep
      ? await Promise.all([
          queryWithTenant(
            applyCursor(
              adminDb
                .collection('leads')
                .where('isDeleted', '==', false)
                .where('ownerUid', '==', auth.user.uid),
            ).limit(limit + 1),
            tenantId,
          ),
          queryWithTenant(
            applyCursor(
              adminDb
                .collection('leads')
                .where('isDeleted', '==', false)
                .where('createdById', '==', auth.user.uid),
            ).limit(limit + 1),
            tenantId,
          ),
          queryWithTenant(
            applyCursor(
              adminDb
                .collection('leads')
                .where('isDeleted', '==', false)
                .where('ownerUid', '==', null),
            ).limit(limit + 1),
            tenantId,
          ),
        ])
      : await Promise.all([
          queryWithTenant(
            applyCursor(adminDb.collection('leads').where('isDeleted', '==', false)).limit(
              limit + 1,
            ),
            tenantId,
          ),
          Promise.resolve([]),
          Promise.resolve([]),
        ]);

    const map = new Map<string, LeadDoc>();
    ownerDocs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));
    createdDocs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));
    unassignedDocs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));

    const allLeads = Array.from(map.entries()).map(([id, data]) => ({
      id,
      companyName: String(data.companyName || data.company || ''),
      contactName: String(data.contactName || data.name || ''),
      contactEmail: String(data.contactEmail || data.email || ''),
      contactPhone: String(data.contactPhone || data.phone || ''),
      disposition: String(data.disposition || ''),
      expectedValueUsd: Number(data.expectedValueUsd || 0),
      packageName: String(data.packageName || ''),
      interestedServices: Array.isArray(data.interestedServices)
        ? data.interestedServices.map(String)
        : [],
      probability: Number(data.probability || 0),
      lastContactedAt: toISO(data.lastContactedAt),
      nextFollowUpAt: toISO(data.nextFollowUpAt),
      source: String(data.source || ''),
      notes: String(data.notes || ''),
      status: String(data.status || 'new'),
      stage: String(data.stage || ''),
      ownerId: data.ownerUid || data.ownerId || null,
      ownerName: data.ownerName || null,
      createdBy: data.createdBy || null,
      updatedBy: data.updatedBy || null,
      lastActivityAt: toISO(data.lastActivityAt),
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
      isDeleted: Boolean(data.isDeleted),
    }));

    const leads = allLeads.slice(0, limit);
    const hasMore = allLeads.length > limit;
    const lastDoc = leads.length > 0 ? leads[leads.length - 1] : null;

    return NextResponse.json({
      ok: true,
      leads,
      pagination: {
        limit,
        cursor: lastDoc?.id || null,
        hasMore,
      },
      canCreate: canWriteSales(role),
    });
  } catch (err: any) {
    console.error('sales leads list error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to load leads.' }, { status: 500 });
  }
}
