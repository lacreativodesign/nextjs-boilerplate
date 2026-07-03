import admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { canCreateLeads, isAdminReadOnly, requireCrmUser, toIso } from '@/lib/crm';
import { AppError, resolveErrorResponse } from '@/lib/errors';
import { logError } from '@/lib/logging';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }

    const role = auth.user.role;
    const query = adminDb
      .collection('leads')
      .where('tenantId', '==', auth.tenantId)
      .orderBy('createdAt', 'desc')
      .limit(500);
    const snap = await query.get();

    const leads = snap.docs
      .filter((doc) => (role === 'sales' ? doc.data().createdBy === auth.user.uid : true))
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: String(data.name || ''),
          email: String(data.email || ''),
          phone: String(data.phone || ''),
          company: String(data.company || ''),
          source: String(data.source || ''),
          status: String(data.status || 'new'),
          createdBy: String(data.createdBy || ''),
          createdAt: toIso(data.createdAt),
        };
      });

    return NextResponse.json({
      ok: true,
      leads,
      readOnly: isAdminReadOnly(role),
      canCreate: canCreateLeads(role),
    });
  } catch (error) {
    logError(error, { route: 'GET /api/crm/leads' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to load leads.',
      context: { module: 'crm', operation: 'list-leads' },
    });
    return NextResponse.json(body, { status, headers });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      throw new AppError({
        message: auth.error,
        code: auth.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        status: auth.status,
      });
    }
    if (!canCreateLeads(auth.user.role)) {
      throw new AppError({
        message: 'Only sales can create leads.',
        code: 'FORBIDDEN',
        status: 403,
      });
    }

    const payload = await req.json();
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();
    const company = String(payload.company || '').trim();
    const source = String(payload.source || '').trim();

    if (!name || !email || !company) {
      throw new AppError({
        message: 'Name, email, and company are required.',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const ref = adminDb.collection('leads').doc();
    await ref.set({
      id: ref.id,
      name,
      email,
      phone,
      company,
      source,
      status: 'new',
      createdBy: auth.user.uid,
      tenantId: auth.tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    logError(error, { route: 'POST /api/crm/leads' });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: 'Unable to create lead.',
      context: { module: 'crm', operation: 'create-lead' },
    });
    return NextResponse.json(body, { status, headers });
  }
}
