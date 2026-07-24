import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';
import {
  paymentReceiptEmailHtml,
  paymentReceiptEmailSubject,
  setPasswordEmailHtml,
  setPasswordEmailSubject,
  welcomeEmailHtml,
  welcomeEmailSubject,
} from '@/lib/email/html-templates';
import { appUrl } from '@/lib/urls';

/**
 * Transactional email outbox (P0-5).
 *
 * This module used to write a row to `email_events` marked pending and then stop there.
 * A repo-wide search finds no reader for that collection and no cron that drains it, so every
 * message queued through it since the feature was written has been discarded:
 *
 *   - app/api/admin/projects/create — payment confirmation, welcome, and the account
 *     activation email carrying the client's set-password link
 *   - app/api/super_admin/tenants   — the new tenant admin's activation email
 *
 * The set-password link is the only way a new client reaches the portal and the only way a
 * super_admin-created tenant admin ever obtains a password. Queueing it into a collection
 * nobody reads meant those accounts were unreachable.
 *
 * The row is now a delivery RECORD, not a promise: the message is rendered and sent inline,
 * and `status` reflects what actually happened. Sending never throws — a provider outage must
 * not roll back the project or tenant that was just created — but a failure is recorded with
 * its reason so it is visible rather than silent.
 */

export type EmailEventStatus = 'sent' | 'failed' | 'unroutable';

type EmailEventInput = {
  templateId: 'payment_confirmation' | 'welcome_client' | 'account_activation' | string;
  to: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sequence?: number;
};

type RenderedEmail = { subject: string; html: string };

function text(value: unknown, fallback = ''): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return candidate || fallback;
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Renders a known template, or returns null when the payload cannot produce a usable email.
 * Returning null is deliberate: an activation email with no set-password link is worse than
 * no email at all, because it tells the recipient to act and gives them nothing to click.
 */
function render(
  templateId: string,
  to: string,
  data: Record<string, unknown>,
): RenderedEmail | null {
  const clientName = text(data.clientName, text(data.tenantName, 'there'));
  const loginUrl = text(data.dashboardLoginUrl, appUrl('/login'));

  if (templateId === 'account_activation') {
    const setPasswordUrl = text(data.setPasswordLink);
    if (!setPasswordUrl) return null;
    return {
      subject: setPasswordEmailSubject(true),
      html: setPasswordEmailHtml({ email: to, setPasswordUrl, isNewUser: true }),
    };
  }

  if (templateId === 'welcome_client') {
    return {
      subject: welcomeEmailSubject(clientName),
      html: welcomeEmailHtml({
        name: clientName,
        companyName: text(data.packageLabel, text(data.projectName, 'your workspace')),
        loginUrl,
      }),
    };
  }

  if (templateId === 'payment_confirmation') {
    const amount = money(data.totalPaidUsd);
    if (amount <= 0) return null;
    return {
      subject: paymentReceiptEmailSubject(text(data.projectName, 'your project')),
      html: paymentReceiptEmailHtml({
        name: clientName,
        amount,
        currency: 'USD',
        date: new Date().toISOString().slice(0, 10),
        invoiceNumber: text(data.projectName, 'your project'),
        dashboardUrl: loginUrl,
      }),
    };
  }

  return null;
}

export async function queueEmailEvent({
  templateId,
  to,
  data,
  metadata,
  sequence,
}: EmailEventInput) {
  const ref = adminDb.collection('email_events').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const recipient = text(to);
  const rendered = recipient ? render(templateId, recipient, data) : null;

  let status: EmailEventStatus = rendered ? 'sent' : 'unroutable';
  let error: string | null = rendered
    ? null
    : `No deliverable email could be rendered for templateId "${templateId}".`;

  if (rendered) {
    try {
      await sendEmail({ to: recipient, subject: rendered.subject, html: rendered.html });
    } catch (sendError: unknown) {
      status = 'failed';
      error = sendError instanceof Error ? sendError.message : 'Unknown email provider error';
      console.error(`[EMAIL] Failed to deliver ${templateId} (event ${ref.id}):`, sendError);
    }
  } else {
    console.error(`[EMAIL] ${templateId} was not deliverable (event ${ref.id}): ${error}`);
  }

  // The stored payload never includes the rendered HTML or the set-password link: the link is
  // a live credential and must exist only in the message itself.
  const { setPasswordLink: _omitted, ...safeData } = data as Record<string, unknown>;
  void _omitted;

  await ref.set({
    templateId,
    to: recipient,
    data: safeData,
    metadata: metadata || {},
    sequence: sequence ?? null,
    status,
    error,
    createdAt: now,
    updatedAt: now,
  });

  return { id: ref.id, status };
}
