import admin from 'firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { runRetentionCleanup } from '@/lib/compliance/data-retention';
import { authorizeCronRequest } from '@/lib/cron/auth';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const configuredBatchSize = Number(process.env.DAILY_RETENTION_TENANT_BATCH_SIZE || 1);
const BATCH_SIZE = Number.isFinite(configuredBatchSize)
  ? Math.min(5, Math.max(1, Math.floor(configuredBatchSize)))
  : 1;

export async function GET(request: NextRequest) {
  const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { success: false, error: authorization.code },
      { status: authorization.status },
    );
  }

  const cursorRef = adminDb.collection('cron_job_cursors').doc('retention-cleanup');
  const cursorSnapshot = await cursorRef.get();
  const lastTenantId = String(cursorSnapshot.data()?.lastTenantId || '');
  const baseQuery = adminDb.collection('tenants').orderBy(admin.firestore.FieldPath.documentId());
  let query = baseQuery.limit(BATCH_SIZE + 1);
  if (lastTenantId) query = baseQuery.startAfter(lastTenantId).limit(BATCH_SIZE + 1);

  let page = await query.get();
  // Wrap immediately when the previous page ended exactly at the collection tail;
  // otherwise an entire daily invocation would do no work merely to reset its cursor.
  if (page.empty && lastTenantId) {
    await cursorRef.delete().catch(() => undefined);
    page = await baseQuery.limit(BATCH_SIZE + 1).get();
  }
  const tenants = page.docs.slice(0, BATCH_SIZE);
  let processed = 0;
  let errors = 0;

  for (const tenant of tenants) {
    try {
      await runRetentionCleanup(tenant.id);
      processed += 1;
    } catch {
      errors += 1;
    }
  }

  const truncated = page.size > BATCH_SIZE;
  if (errors === 0) {
    if (truncated && tenants.length > 0) {
      await cursorRef.set({
        lastTenantId: tenants[tenants.length - 1].id,
        updatedAt: new Date(),
      });
    } else {
      await cursorRef.delete().catch(() => undefined);
    }
  }

  return NextResponse.json(
    {
      success: errors === 0,
      blocked: errors === 0 && truncated,
      processed,
      errors,
      truncated,
      batchSize: BATCH_SIZE,
    },
    { status: errors === 0 ? 200 : 500 },
  );
}
