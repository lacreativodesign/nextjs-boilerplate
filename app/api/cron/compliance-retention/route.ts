import { NextRequest, NextResponse } from 'next/server';
import { runRetentionCleanupAcrossTenants } from '@/lib/compliance/data-retention';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  if (!CRON_SECRET)
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await runRetentionCleanupAcrossTenants();
  return NextResponse.json({ success: true, results });
}
