import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId } from '@/lib/tenant';
import { parseString, requireSalesRead, toISO } from '../../_utils';

export const dynamic = 'force-dynamic';

/**
 * S19: fetch a single lead.
 *
 * No single-lead endpoint existed, which is why the lead detail page rendered a hardcoded
 * lead: clicking ANY real lead in the list showed the same invented person instead of that
 * lead's data.
 *
 * The guard mirrors /api/sales/lead-notes/list exactly: tenant must match (super_admin
 * excepted), and a `sales` rep may only read a lead they own.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const leadId = parseString(searchParams.get('leadId'), '');
    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'Lead id is required.' }, { status: 400 });
    }

    const leadSnap = await adminDb.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Lead not found.' }, { status: 404 });
    }

    const data = leadSnap.data() || {};
    if (docTenantId(data) !== auth.user.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (auth.user.role === 'sales' && data.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (data.isDeleted) {
      return NextResponse.json({ ok: false, error: 'Lead not found.' }, { status: 404 });
    }

    const lead = {
      id: leadSnap.id,
      companyName: String(data.companyName || data.company || ''),
      contactName: String(data.contactName || data.name || ''),
      contactEmail: String(data.contactEmail || data.email || ''),
      contactPhone: String(data.contactPhone || data.phone || ''),
      source: String(data.source || ''),
      status: String(data.status || 'new'),
      stage: String(data.stage || ''),
      packageName: String(data.packageName || ''),
      expectedValueUsd: Number(data.expectedValueUsd || 0),
      ownerName: String(data.ownerName || ''),
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
    };

    return NextResponse.json({ ok: true, lead });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to load lead.' }, { status: 500 });
  }
}
