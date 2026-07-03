import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { parseNumber, parseString, requireAdmin, serverTimestamp } from '../../_utils';
import { logEvent } from '@/lib/audit';
import { getClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = parseString(body?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Expense id is required.' }, { status: 400 });
    }

    const ref = adminDb.collection('expenses').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const existing = snap.data() || {};
    const isSuperAdmin = (auth.user.role || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin && String(existing.tenantId || '') !== String(auth.user.tenantId || '')) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    const updates: Record<string, any> = { updatedAt: serverTimestamp() };
    if (body?.category !== undefined) updates.category = parseString(body.category).trim();
    if (body?.vendor !== undefined) updates.vendor = parseString(body.vendor).trim();
    if (body?.amountPkr !== undefined) updates.amountPkr = parseNumber(body.amountPkr, 0);
    if (body?.expenseDate !== undefined) {
      const d = parseString(body.expenseDate).trim();
      updates.expenseDate = d ? new Date(d) : null;
    }
    if (body?.status !== undefined) updates.status = parseString(body.status).trim();
    if (body?.notes !== undefined) updates.notes = parseString(body.notes).trim() || null;

    await ref.set(updates, { merge: true });

    try {
      const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || '';
      const changes = Object.entries(updates)
        .filter(([field]) => !['updatedAt'].includes(field))
        .map(([field, value]) => ({ field, oldValue: existing[field] ?? null, newValue: value }));
      await logEvent({
        type: 'finance.expense_updated',
        title: 'Expense updated',
        description: `${String(existing.category || 'Expense')} updated.`,
        entityType: 'expense',
        entityId: id,
        actor: { uid: auth.user.uid, name: actorName },
        metadata: {
          ip: getClientIp(req),
          userAgent: req.headers.get('user-agent') || '',
        },
        audit: {
          action: 'update',
          resource: 'expense',
          resourceId: id,
          changes,
        },
      });
    } catch (auditError) {
      console.error('audit log error:', auditError);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('finance/expenses update error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError ? 'Missing Firestore index.' : 'Unable to update expense.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
