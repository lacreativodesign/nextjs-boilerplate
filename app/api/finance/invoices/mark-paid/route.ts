import { NextResponse } from 'next/server';
import { requireFinance } from '../../_utils';
import { assertPermission, Permission } from '../../../../lib/permissions';
import { POST as updateInvoice } from '../update/route';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireFinance();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    assertPermission(auth.user.role, Permission.MarkPaymentPaid);
  } catch {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const nextBody = { ...body, action: 'mark_paid' };
  const nextReq = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(nextBody),
  });

  return updateInvoice(nextReq);
}
