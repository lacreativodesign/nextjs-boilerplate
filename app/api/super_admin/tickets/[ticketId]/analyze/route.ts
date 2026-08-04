import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import { PLATFORM_TICKETS_COLLECTION } from '@/lib/support/types';
import { triageTicket } from '@/lib/support/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { ticketId: string } };

/**
 * Run triage on a single ticket, on demand, super-admin only.
 *
 * This is the click that spends the platform AI budget — deliberately gated to
 * super_admin and to a single explicit request per ticket. The triage engine
 * itself enforces the daily cap and the injection-safe, tool-free model call;
 * this route only supplies the ticket text and persists the verdict.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireSuperAdmin(req);
    const ticketId = context.params.ticketId;

    const ref = adminDb.collection(PLATFORM_TICKETS_COLLECTION).doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Ticket not found' }, { status: 404 });
    }
    const ticket = snap.data() || {};

    // Mark analyzing so the UI can reflect in-flight state.
    await ref.update({ triageStatus: 'analyzing', updatedAt: new Date() });

    const outcome = await triageTicket({
      title: typeof ticket.title === 'string' ? ticket.title : '',
      description: typeof ticket.description === 'string' ? ticket.description : '',
      category: typeof ticket.category === 'string' ? ticket.category : 'question',
      pageUrl: typeof ticket.pageUrl === 'string' ? ticket.pageUrl : null,
      reporterRole:
        ticket.reporter && typeof ticket.reporter.role === 'string' ? ticket.reporter.role : '',
    });

    if (!outcome.ok) {
      // Revert to a terminal, non-analyzing state so the button is actionable again.
      const nextStatus = outcome.reason === 'budget_exceeded' ? 'untriaged' : 'failed';
      await ref.update({ triageStatus: nextStatus, updatedAt: new Date() });

      const httpStatus =
        outcome.reason === 'budget_exceeded' ? 429 : outcome.reason === 'no_key' ? 503 : 502;
      return NextResponse.json({ ok: false, error: outcome.message }, { status: httpStatus });
    }

    await ref.update({
      triage: outcome.triage,
      triageStatus: 'analyzed',
      updatedAt: new Date(),
    });

    await writeAuditLog({
      tenantId: typeof ticket.tenantId === 'string' ? ticket.tenantId : null,
      actorUserId: user.uid,
      actorName: typeof user.displayName === 'string' ? user.displayName : null,
      actorRole: typeof user.role === 'string' ? user.role : null,
      actionType: 'support_ticket_triage',
      entityType: 'platform_ticket',
      entityId: ticketId,
      metadata: { fixKind: outcome.triage.fixKind, model: outcome.triage.model },
    });

    return NextResponse.json({ ok: true, triage: outcome.triage });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    if (status === 500) console.error('SUPER_ADMIN_TICKET_ANALYZE_ERROR', err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
