import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/tenant/server';
import { checkAiPlan, aiPlanLockedBody } from '@/lib/ai/plan-gate';
import { cookies } from 'next/headers';
import { adminDb } from '@/lib/firebaseAdmin';
import { writeAuditLog } from '@/lib/tenant/audit';
import { sendEmail } from '@/lib/email/email-service';
import { resolveTenantSenderById } from '@/lib/email/tenant-sender';
import { tenantBrand } from '@/lib/email/html-templates';
import type { ProposedAction } from '@/lib/ai/finance-agent';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['admin', 'super_admin', 'finance']);

type FirestoreTimestampLike = { toDate: () => Date };
type FinanceWriteBody = {
  action?: string;
  taskId?: string;
  actionId?: string;
  input?: Record<string, unknown>;
};

type TaskData = {
  tenantId?: string;
  proposedActions?: ProposedAction[];
};

type InvoiceData = {
  tenantId?: string;
  isPaid?: boolean;
  clientEmail?: string;
  clientName?: string;
  amountTotalUsd?: number | string;
  orderId?: string;
  dueDate?: string | number | Date | FirestoreTimestampLike;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toDate(value: InvoiceData['dueDate']): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeActions(actions: unknown): ProposedAction[] {
  return Array.isArray(actions)
    ? actions.filter((action): action is ProposedAction => {
        return Boolean(
          action && typeof action === 'object' && 'id' in action && 'status' in action,
        );
      })
    : [];
}

async function loadTenantTask(taskId: string, tenantId: string) {
  const taskSnap = await adminDb.collection('agent_tasks').doc(taskId).get();
  if (!taskSnap.exists)
    return { error: NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 }) };

  const taskData = taskSnap.data() as TaskData;
  if (taskData.tenantId !== tenantId)
    return { error: NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }) };

  return { taskData };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser({ cookies: cookies() });
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const aiPlan = await checkAiPlan(user.tenantId!);
    if (!aiPlan.ok) {
      return NextResponse.json(aiPlanLockedBody(aiPlan), { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as FinanceWriteBody;
    const { action, taskId, actionId, input } = body;

    if (!action || !taskId || !actionId) {
      return NextResponse.json(
        { ok: false, error: 'action, taskId, actionId required' },
        { status: 400 },
      );
    }

    const taskResult = await loadTenantTask(taskId, user.tenantId!);
    if (taskResult.error) return taskResult.error;

    const currentActions = normalizeActions(taskResult.taskData?.proposedActions);
    const proposedAction = currentActions.find((a) => a.id === actionId);
    if (!proposedAction)
      return NextResponse.json({ ok: false, error: 'Proposed action not found' }, { status: 404 });
    if (proposedAction.status !== 'pending') {
      return NextResponse.json(
        { ok: false, error: `Action already ${proposedAction.status}` },
        { status: 409 },
      );
    }

    if (action === 'reject_proposed_action') {
      const actions = currentActions.map((a) =>
        a.id === actionId ? { ...a, status: 'rejected' as const } : a,
      );
      const allResolved = actions.every((a) => a.status !== 'pending');
      await adminDb
        .collection('agent_tasks')
        .doc(taskId)
        .set(
          { proposedActions: actions, ...(allResolved ? { status: 'completed' } : {}) },
          { merge: true },
        );
      return NextResponse.json({ ok: true, rejected: true });
    }

    if (action === 'send_payment_reminder') {
      if (proposedAction.toolName !== 'send_payment_reminder') {
        return NextResponse.json({ ok: false, error: 'Action type mismatch' }, { status: 400 });
      }

      const invoiceId = String(input?.invoiceId || proposedAction.input.invoiceId || '').trim();
      if (!invoiceId)
        return NextResponse.json({ ok: false, error: 'invoiceId required' }, { status: 400 });

      const invoiceSnap = await adminDb.collection('invoices').doc(invoiceId).get();
      if (!invoiceSnap.exists)
        return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });

      const invoice = (invoiceSnap.data() || {}) as InvoiceData;
      if (invoice.tenantId !== user.tenantId)
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      if (invoice.isPaid)
        return NextResponse.json({ ok: false, error: 'Invoice is already paid' }, { status: 409 });

      const clientEmail = typeof invoice.clientEmail === 'string' ? invoice.clientEmail.trim() : '';
      if (!clientEmail)
        return NextResponse.json(
          { ok: false, error: 'Invoice client email is missing' },
          { status: 400 },
        );

      const dueDateObj = toDate(invoice.dueDate);
      if (dueDateObj && dueDateObj >= new Date()) {
        return NextResponse.json({ ok: false, error: 'Invoice is not overdue' }, { status: 409 });
      }

      const clientName = escapeHtml(invoice.clientName || 'Valued Client');
      const amount = Number(invoice.amountTotalUsd || 0).toFixed(2);
      const orderId = escapeHtml(String(invoice.orderId || invoiceId));
      const dueDate = dueDateObj
        ? dueDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'the due date';

      const rawCustomMessage = String(input?.message || proposedAction.input.message || '').trim();
      const customMessage = rawCustomMessage ? escapeHtml(rawCustomMessage) : '';

      // MAIL-4: the AI agent's payment reminder goes to the TENANT's customer, so it is
      // addressed as the tenant rather than as Bizosto — same rule as the cron reminder
      // and the invoice itself.
      //
      // MAIL-8: and the BODY says so too. This rendered a hard-coded "B / Bizosto" header
      // block to the customer, so a chase for money owed to the tenant arrived branded as
      // a company the recipient has never dealt with.
      const tenantSnap = await adminDb
        .collection('tenants')
        .doc(String(user.tenantId || ''))
        .get();
      const senderBrand = tenantBrand(String(tenantSnap.data()?.name || ''));

      await sendEmail({
        to: clientEmail,
        ...(await resolveTenantSenderById(user.tenantId)),
        subject: `Payment Reminder — ${orderId}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
            <div style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
              <span style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">${senderBrand.initial}</span>
              <p style="color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:0.2em;margin:4px 0 0;text-transform:uppercase;">${senderBrand.name}</p>
            </div>
            <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${clientName},</p>
              <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
                This is a friendly reminder that invoice <strong>${orderId}</strong> for <strong>$${amount}</strong> was due on <strong>${dueDate}</strong> and remains outstanding.
              </p>
              ${customMessage ? `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${customMessage}</p>` : ''}
              <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
                Please arrange payment at your earliest convenience. If you have any questions or believe this message was sent in error, please reply to this email.
              </p>
              <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">Thank you for your business.</p>
            </div>
          </div>
        `,
      });

      await writeAuditLog({
        tenantId: user.tenantId,
        actorUserId: user.uid,
        actorName: user.fullName || user.email,
        actorRole: user.role,
        actionType: 'ai.finance.send_payment_reminder',
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: { taskId, actionId, clientEmail, amount, orderId },
      });

      await adminDb
        .collection('invoices')
        .doc(invoiceId)
        .set({ lastReminderSentAt: new Date().toISOString() }, { merge: true });

      const actions = currentActions.map((a) =>
        a.id === actionId
          ? { ...a, status: 'executed' as const, executedAt: new Date().toISOString() }
          : a,
      );
      const allResolved = actions.every((a) => a.status !== 'pending');
      await adminDb
        .collection('agent_tasks')
        .doc(taskId)
        .set(
          { proposedActions: actions, ...(allResolved ? { status: 'completed' } : {}) },
          { merge: true },
        );

      return NextResponse.json({ ok: true, sent: true, to: clientEmail });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('[FINANCE_WRITE]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
