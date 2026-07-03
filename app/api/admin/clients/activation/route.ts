import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole } from '../../_utils';
import { queueClientActivationInvite } from '@/lib/clientActivation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId || '').trim();
    if (!clientId) {
      return NextResponse.json({ ok: false, error: 'Missing clientId' }, { status: 400 });
    }

    const clientSnap = await adminDb.collection('clients').doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientSnap.data() || {};
    if (clientData.tenantId !== current.tenantId) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 });
    }
    await queueClientActivationInvite({
      clientId,
      clientData: {
        primaryContactEmail: clientData.primaryContactEmail,
        primaryContactName: clientData.primaryContactName,
        companyName: clientData.companyName,
        portalUserUid: clientData.portalUserUid,
      },
      createdByUid: current.uid,
      reason: 'manual_activation',
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('client activation error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
