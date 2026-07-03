import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb as db } from '@/lib/firebaseAdmin';
import { getSessionUser, isClientRole } from '../_utils';
import { normalizeOptionalSlug, normalizeSlugArray, slugify } from '@/lib/segments';

export const dynamic = 'force-dynamic';

function cleanString(value: any) {
  return String(value ?? '').trim();
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!isClientRole(me.role))
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const clientId = String(me.clientId || '').trim();
  if (!clientId)
    return NextResponse.json({ ok: false, error: 'Client profile not found' }, { status: 404 });

  try {
    const snap = await db.collection('clients').doc(clientId).get();
    if (!snap.exists)
      return NextResponse.json({ ok: false, error: 'Client profile not found' }, { status: 404 });

    const data = snap.data() || {};
    if ((data as any).deletedAt) {
      return NextResponse.json({ ok: false, error: 'Client profile not found' }, { status: 404 });
    }
    if (String((data as any).tenantId || '') !== me.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, client: { id: snap.id, ...data } });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to load profile' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!isClientRole(me.role))
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const clientId = String(me.clientId || '').trim();
  if (!clientId)
    return NextResponse.json({ ok: false, error: 'Client profile not found' }, { status: 404 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  try {
    const ref = db.collection('clients').doc(clientId);
    const snap = await ref.get();
    if (!snap.exists)
      return NextResponse.json({ ok: false, error: 'Client profile not found' }, { status: 404 });
    if (String((snap.data() || {}).tenantId || '') !== me.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, any> = {};

    if (body?.industry !== undefined) updateData.industry = cleanString(body.industry);
    if (body?.businessType !== undefined) updateData.businessType = cleanString(body.businessType);
    if (body?.country !== undefined) updateData.country = cleanString(body.country);
    if (body?.city !== undefined) updateData.city = cleanString(body.city);
    if (body?.timezone !== undefined) updateData.timezone = cleanString(body.timezone);

    if (body?.employeeCountRange !== undefined)
      updateData.employeeCountRange = cleanString(body.employeeCountRange) || null;
    if (body?.yearsInBusinessRange !== undefined) {
      updateData.yearsInBusinessRange = cleanString(body.yearsInBusinessRange) || null;
    }

    if (body?.segmentServices !== undefined)
      updateData.segmentServices = normalizeSlugArray(body.segmentServices);
    if (body?.segmentIndustry !== undefined)
      updateData.segmentIndustry = normalizeOptionalSlug(body.segmentIndustry);
    if (body?.segmentBusinessType !== undefined)
      updateData.segmentBusinessType = normalizeOptionalSlug(body.segmentBusinessType);

    if (body?.segmentGeo !== undefined) {
      updateData.segmentGeo = normalizeOptionalSlug(body.segmentGeo);
    } else if (body?.country !== undefined) {
      const derived = slugify(cleanString(body.country));
      updateData.segmentGeo = derived || null;
    }

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.lastActivity = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(updateData, { merge: true });

    return NextResponse.json({ ok: true, id: clientId });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to update profile' },
      { status: 500 },
    );
  }
}
