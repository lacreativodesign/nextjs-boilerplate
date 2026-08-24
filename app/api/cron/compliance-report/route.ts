import { NextRequest, NextResponse } from 'next/server';
import { generateComplianceReport } from '@/lib/compliance/data-retention';
import { authorizeCronRequest } from '@/lib/cron/auth';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const TENANT_BUDGET = 50;

export async function GET(request: NextRequest) {
  const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { success: false, error: authorization.code },
      { status: authorization.status },
    );
  }

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setUTCDate(periodStart.getUTCDate() - 7);
  const weekKey = now.toISOString().slice(0, 10);
  const tenants = await adminDb
    .collection('tenants')
    .limit(TENANT_BUDGET + 1)
    .get();
  const truncated = tenants.size > TENANT_BUDGET;
  let generated = 0;
  let alreadyRecorded = 0;
  let errors = 0;

  for (const tenant of tenants.docs.slice(0, TENANT_BUDGET)) {
    const runRef = adminDb
      .collection('cron_compliance_report_runs')
      .doc(`${weekKey}__${tenant.id}`);
    const acquired = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(runRef);
      // Any record is terminal for automatic execution. Ambiguous failures require owner
      // review instead of risking a duplicate compliance report and rewritten history.
      if (snapshot.exists) return false;
      transaction.set(
        runRef,
        { weekKey, tenantId: tenant.id, status: 'running', startedAt: now },
        { merge: true },
      );
      return true;
    });

    if (!acquired) {
      alreadyRecorded += 1;
      continue;
    }

    try {
      const report = await generateComplianceReport({
        tenantId: tenant.id,
        type: 'summary',
        periodStart,
        periodEnd: now,
        generatedBy: 'system:cron',
      });
      await runRef.set(
        { status: 'completed', reportId: report.reportId, completedAt: new Date() },
        { merge: true },
      );
      generated += 1;
    } catch {
      await runRef.set({ status: 'owner_review_required', failedAt: new Date() }, { merge: true });
      errors += 1;
    }
  }

  if (errors > 0) {
    return NextResponse.json(
      { success: false, generated, alreadyRecorded, errors, truncated },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    blocked: truncated,
    generated,
    alreadyRecorded,
    errors,
    truncated,
  });
}
