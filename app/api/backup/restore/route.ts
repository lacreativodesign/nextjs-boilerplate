import { NextRequest, NextResponse } from 'next/server';
import { restoreBackup } from '@/lib/backup/restore';
import { requireSuperAdmin } from '@/app/api/super_admin/_utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const body = (await req.json()) as {
      backupId?: string;
      dryRun?: boolean;
      tenantIds?: string[];
    };
    if (!body?.backupId || typeof body.backupId !== 'string') {
      return NextResponse.json({ ok: false, error: 'backupId is required' }, { status: 400 });
    }

    // P1-6b: dryRun verifies the manifest and every checksum and reports what WOULD be written,
    // without touching Firestore. Recommended before any real restore.
    const result = await restoreBackup(body.backupId, {
      dryRun: body.dryRun === true,
      tenantIds: Array.isArray(body.tenantIds) ? body.tenantIds : undefined,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    const message = error?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
