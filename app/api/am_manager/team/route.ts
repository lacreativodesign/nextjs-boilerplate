import { NextResponse } from 'next/server';
import { getDirectReports } from '@/lib/team';
import { requireAmManagerOrAdmin } from '../../admin/_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAmManagerOrAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing.' }, { status: 403 });
    }

    const team = await getDirectReports({
      tenantId: auth.user.tenantId,
      managerUid: auth.user.uid,
      reportRole: 'am',
    });

    return NextResponse.json({ ok: true, team });
  } catch (err: any) {
    console.error('am manager team error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to load team.' }, { status: 500 });
  }
}
