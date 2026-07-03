import { NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '../../../admin/_utils';
import { requireFinance } from '../../_utils';
import { assertPermission, Permission } from '../../../../lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdminOrSuperAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  }

  try {
    assertPermission(admin.user.role, Permission.ViewReports);
  } catch {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const finance = await requireFinance();
  if (!finance.ok) {
    return NextResponse.json({ ok: false, error: finance.error }, { status: finance.status });
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
  });
}
