import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getCurrentUser, isAdminRole, normalizeRole } from '@/app/api/admin/_utils';

export const runtime = 'nodejs';

type UpdateBody = Partial<{
  name: string;
  rate: number;
  country: string;
  state: string | null;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  taxIdNumber: string | null;
  inclusive: boolean;
  isDeleted: boolean;
}>;

const nowIso = () => new Date().toISOString();

function canManageTax(role?: string | null) {
  const normalized = normalizeRole(role || '');
  return normalized === 'finance' || isAdminRole(normalized);
}

export async function GET(_: Request, { params }: { params: { taxRateId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const tenantId = String(user.tenantId || '').trim();
    const taxRateId = String(params.taxRateId || '').trim();
    const snap = await adminDb.collection('tax_rates').doc(taxRateId).get();
    if (!snap.exists)
      return NextResponse.json({ ok: false, error: 'Tax rate not found' }, { status: 404 });
    const data = snap.data() || {};
    if (String(data.tenantId || '') !== tenantId || data.isDeleted === true) {
      return NextResponse.json({ ok: false, error: 'Tax rate not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, taxRate: { id: snap.id, ...data } });
  } catch (error) {
    console.error('[TAX_RATE_GET]', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch tax rate' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { taxRateId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (!canManageTax(user.role))
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const tenantId = String(user.tenantId || '').trim();
    const taxRateId = String(params.taxRateId || '').trim();
    const docRef = adminDb.collection('tax_rates').doc(taxRateId);
    const snap = await docRef.get();
    if (!snap.exists)
      return NextResponse.json({ ok: false, error: 'Tax rate not found' }, { status: 404 });
    const existing = snap.data() || {};
    if (String(existing.tenantId || '') !== tenantId || existing.isDeleted === true) {
      return NextResponse.json({ ok: false, error: 'Tax rate not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as UpdateBody;
    const updates: Record<string, unknown> = { updatedAt: nowIso() };
    const blockedKeys = new Set(['tenantId', 'createdAt', 'id']);

    Object.entries(body).forEach(([key, value]) => {
      if (!blockedKeys.has(key)) {
        updates[key] = value;
      }
    });

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (name.length < 2 || name.length > 50) {
        return NextResponse.json(
          { ok: false, error: 'name must be between 2 and 50 characters' },
          { status: 400 },
        );
      }
      updates.name = name;
    }

    if (body.rate !== undefined) {
      const rate = Number(body.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
        return NextResponse.json(
          { ok: false, error: 'rate must be between 0 and 100' },
          { status: 400 },
        );
      }
      updates.rate = parseFloat(rate.toFixed(2));
    }

    if (body.isDefault === true) {
      const existingDefaults = await adminDb
        .collection('tax_rates')
        .where('tenantId', '==', tenantId)
        .get();
      const batch = adminDb.batch();
      existingDefaults.docs.forEach((doc) => {
        if (doc.id !== taxRateId && doc.data().isDeleted !== true) {
          batch.update(doc.ref, { isDefault: false, updatedAt: nowIso() });
        }
      });
      await batch.commit();
      updates.isDefault = true;
    }

    await docRef.update(updates);
    const updated = await docRef.get();
    return NextResponse.json({ ok: true, taxRate: { id: updated.id, ...updated.data() } });
  } catch (error) {
    console.error('[TAX_RATE_PATCH]', error);
    return NextResponse.json({ ok: false, error: 'Failed to update tax rate' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { taxRateId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (!canManageTax(user.role))
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const tenantId = String(user.tenantId || '').trim();
    const taxRateId = String(params.taxRateId || '').trim();
    const docRef = adminDb.collection('tax_rates').doc(taxRateId);
    const snap = await docRef.get();
    if (!snap.exists)
      return NextResponse.json({ ok: false, error: 'Tax rate not found' }, { status: 404 });
    const data = snap.data() || {};
    if (String(data.tenantId || '') !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Tax rate not found' }, { status: 404 });
    }

    await docRef.set({ isDeleted: true, updatedAt: nowIso() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[TAX_RATE_DELETE]', error);
    return NextResponse.json({ ok: false, error: 'Failed to delete tax rate' }, { status: 500 });
  }
}
