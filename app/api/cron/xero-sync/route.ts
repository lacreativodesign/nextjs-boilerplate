import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { runXeroSync } from '@/lib/integrations/xero';
import { authorizeCronRequest } from '@/lib/cron/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, error: authorization.code },
        { status: authorization.status },
      );
    }

    const integrations = await adminDb
      .collectionGroup('integrations')
      .where('connected', '==', true)
      .where('settings.scheduleDaily', '==', true)
      .get();
    const results: Array<{ tenantId: string; ok: boolean; error?: string }> = [];

    for (const doc of integrations.docs) {
      if (doc.id !== 'xero') continue;
      const tenantRef = doc.ref.parent.parent;
      if (!tenantRef) continue;
      const tenantId = tenantRef.id;
      try {
        await runXeroSync({ tenantId, userUid: 'system:cron' });
        results.push({ tenantId, ok: true });
      } catch (error: any) {
        results.push({ tenantId, ok: false, error: error?.message || 'Sync failed' });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error: any) {
    console.error('cron/xero-sync error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Xero cron sync failed.' },
      { status: 500 },
    );
  }
}
