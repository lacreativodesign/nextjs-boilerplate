import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSuperAdmin } from '../../_utils';
import { backfillFileTenantIds } from '@/lib/tenant/backfill-file-tenant';
import { backfillHrDocumentTenantIds } from '@/lib/tenant/backfill-hr-document-tenant';
import { writeAuditLog } from '@/lib/tenant/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * S13: super_admin-only runner for the tenant-repair backfills.
 *
 * The backfill libraries existed but had no execution path: they were only exposed as CLI
 * scripts, and this project is operated entirely through Claude Code and the browser —
 * there is no terminal, no Codespaces and no local machine. They were therefore dead code.
 * (The pre-existing /api/super_admin/backfill-invoice-tokens route has the same problem:
 * no caller anywhere.)
 *
 * Both jobs are idempotent: they only touch records that are actually missing a tenantId,
 * and they never assign a default or arbitrary tenant — a record whose owning entity
 * cannot be resolved is skipped and reported. `dryRun` reports exactly what would change
 * without writing anything.
 */
const JOBS = ['files', 'hr_documents', 'all'] as const;
type Job = (typeof JOBS)[number];

export async function POST(req: NextRequest) {
  try {
    const superAdmin = await requireSuperAdmin(req);

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const job = String((body as Record<string, unknown>)?.job || '') as Job;
    const dryRun = (body as Record<string, unknown>)?.dryRun === true;

    if (!JOBS.includes(job)) {
      return NextResponse.json(
        { ok: false, error: `job must be one of: ${JOBS.join(', ')}` },
        { status: 400 },
      );
    }

    const results: Record<string, unknown> = {};

    if (job === 'files' || job === 'all') {
      results.files = await backfillFileTenantIds({ dryRun });
    }

    if (job === 'hr_documents' || job === 'all') {
      results.hrDocuments = await backfillHrDocumentTenantIds({ dryRun });
    }

    // A real repair mutates production data across every tenant. Record who ran it.
    if (!dryRun) {
      await writeAuditLog({
        tenantId: superAdmin.tenantId,
        actorUserId: superAdmin.uid,
        actorName: superAdmin.fullName || superAdmin.email,
        actorRole: superAdmin.role,
        actionType: 'platform.maintenance.backfill_tenant_ids',
        entityType: 'platform',
        entityId: job,
        metadata: { job, results },
      });
    }

    return NextResponse.json({ ok: true, job, dryRun, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
