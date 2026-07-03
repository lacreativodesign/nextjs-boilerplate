import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/tenant/server';
import { cookies } from 'next/headers';
import { getAgentTask } from '@/lib/ai/agent-task';
import { runSalesAgent } from '@/lib/ai/sales-agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const ALLOWED_ROLES = new Set(['admin', 'super_admin', 'sales_manager', 'sales']);

export async function POST(_req: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const user = await getCurrentUser({ cookies: cookies() });
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const taskId = String(params?.taskId || '').trim();
    if (!taskId) return NextResponse.json({ ok: false, error: 'taskId required' }, { status: 400 });

    const task = await getAgentTask(taskId);
    if (!task) return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    if (task.tenantId !== user.tenantId)
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    if (task.status !== 'queued')
      return NextResponse.json(
        { ok: false, error: `Task already ${task.status}` },
        { status: 409 },
      );

    await runSalesAgent(taskId, user.tenantId);
    return NextResponse.json({ ok: true, taskId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
