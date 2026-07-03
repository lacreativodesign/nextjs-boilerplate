import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { requireModule, isPlanAccessError } from '@/app/lib/plan-enforcement';
import { TimeTrackingService } from '@/lib/hr/time-tracking';

export const runtime = 'nodejs';

const createEntrySchema = z.object({
  source: z.enum(['clock', 'manual', 'timer']),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  breakMinutes: z.number().int().min(0).max(480).optional(),
  billable: z.boolean().default(false),
  projectId: z.string().min(1).optional().nullable(),
  projectName: z.string().min(1).optional().nullable(),
  taskId: z.string().min(1).optional().nullable(),
  taskName: z.string().min(1).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const listSchema = z.object({
  userId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  projectId: z.string().optional(),
});

async function getAuthorizedUser() {
  const me = await getCurrentUser();
  if (!me?.tenantId) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }

  try {
    await requireModule(me.tenantId, 'hr', { role: me.role });
  } catch (err) {
    if (isPlanAccessError(err)) {
      return {
        ok: false as const,
        response: NextResponse.json({ ok: false, error: err.message }, { status: err.status }),
      };
    }
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: 'Unable to validate module access' },
        { status: 500 },
      ),
    };
  }

  return { ok: true as const, me };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthorizedUser();
    if (!auth.ok) return auth.response;

    const payload = createEntrySchema.parse(await request.json());

    const entry = await TimeTrackingService.createTimeEntry({
      tenantId: auth.me.tenantId,
      userId: auth.me.uid,
      userName: auth.me.name || auth.me.fullName || auth.me.email || auth.me.uid,
      source: payload.source,
      startAt: new Date(payload.startAt),
      endAt: payload.endAt ? new Date(payload.endAt) : null,
      breakMinutes: payload.breakMinutes,
      billable: payload.billable,
      projectId: payload.projectId || null,
      projectName: payload.projectName || null,
      taskId: payload.taskId || null,
      taskName: payload.taskName || null,
      notes: payload.notes || null,
    });

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    console.error('HR time entries create error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to create time entry' },
      { status: 400 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthorizedUser();
    if (!auth.ok) return auth.response;

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const query = listSchema.parse(params);

    const entries = await TimeTrackingService.listTimeEntries({
      tenantId: auth.me.tenantId,
      requesterUserId: auth.me.uid,
      requesterRole: auth.me.role,
      userId: query.userId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      projectId: query.projectId,
    });

    return NextResponse.json({ ok: true, entries });
  } catch (err) {
    console.error('HR time entries list error', err);
    return NextResponse.json({ ok: false, error: 'Failed to load time entries' }, { status: 400 });
  }
}
