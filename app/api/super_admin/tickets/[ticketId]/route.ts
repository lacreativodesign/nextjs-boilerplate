import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../_utils';
import { writeAuditLog } from '@/lib/tenant/audit';
import {
  PLATFORM_TICKETS_COLLECTION,
  parseTicketPriority,
  parseTicketStatus,
} from '@/lib/support/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as any).toDate === 'function'
  ) {
    const date = (value as any).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return null;
}

type RouteContext = { params: { ticketId: string } };

/** Single-ticket read. Replaces the old fetch-all-then-find on the client. */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireSuperAdmin(req);

    const ticketId = context.params.ticketId;
    const snap = await adminDb.collection(PLATFORM_TICKETS_COLLECTION).doc(ticketId).get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Ticket not found' }, { status: 404 });
    }

    const data = snap.data() || {};
    return NextResponse.json({
      ok: true,
      ticket: {
        id: snap.id,
        ...data,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      },
    });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    if (status === 500) console.error('SUPER_ADMIN_TICKET_GET_ERROR', err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/**
 * Mutate a ticket's operational fields: status, priority, assignedTo.
 * Every change is audit-logged with the actor. Content fields (title,
 * description, reporter, tenantId) are immutable here — they are the reporter's
 * record, not the operator's to rewrite.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireSuperAdmin(req);
    const ticketId = context.params.ticketId;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
    }

    const ref = adminDb.collection(PLATFORM_TICKETS_COLLECTION).doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Ticket not found' }, { status: 404 });
    }
    const existing = snap.data() || {};

    const updates: Record<string, unknown> = {};
    const changed: Record<string, { from: unknown; to: unknown }> = {};

    if ('status' in body) {
      const status = parseTicketStatus(body.status);
      if (!status) {
        return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
      }
      if (status !== existing.status) {
        updates.status = status;
        changed.status = { from: existing.status ?? null, to: status };
      }
    }

    if ('priority' in body) {
      const priority = parseTicketPriority(body.priority);
      if (!priority) {
        return NextResponse.json({ ok: false, error: 'Invalid priority' }, { status: 400 });
      }
      if (priority !== existing.priority) {
        updates.priority = priority;
        changed.priority = { from: existing.priority ?? null, to: priority };
      }
    }

    if ('assignedTo' in body) {
      const assignedTo =
        body.assignedTo === null
          ? null
          : typeof body.assignedTo === 'string'
            ? body.assignedTo.trim().slice(0, 200) || null
            : undefined;
      if (assignedTo === undefined) {
        return NextResponse.json({ ok: false, error: 'Invalid assignedTo' }, { status: 400 });
      }
      if (assignedTo !== (existing.assignedTo ?? null)) {
        updates.assignedTo = assignedTo;
        changed.assignedTo = { from: existing.assignedTo ?? null, to: assignedTo };
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    updates.updatedAt = new Date();
    await ref.update(updates);

    await writeAuditLog({
      tenantId: typeof existing.tenantId === 'string' ? existing.tenantId : null,
      actorUserId: user.uid,
      actorName: typeof user.displayName === 'string' ? user.displayName : null,
      actorRole: typeof user.role === 'string' ? user.role : null,
      actionType: 'support_ticket_update',
      entityType: 'platform_ticket',
      entityId: ticketId,
      metadata: { changed },
    });

    return NextResponse.json({ ok: true, changed });
  } catch (err: any) {
    const message = err?.message || 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    if (status === 500) console.error('SUPER_ADMIN_TICKET_PATCH_ERROR', err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
