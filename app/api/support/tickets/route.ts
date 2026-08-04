import { NextResponse } from 'next/server';
import { getCurrentUser, isAdminRole } from '@/app/api/admin/_utils';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeTenantId, DEFAULT_TENANT_ID } from '@/lib/tenant';
import { isAppError, resolveErrorResponse } from '@/lib/errors';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createRoleNotifications } from '@/app/lib/notifications';
import {
  PLATFORM_TICKETS_COLLECTION,
  normalizeTicketCategory,
  normalizeTicketPriority,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support/types';
import {
  parseScreenshotDataUrl,
  ticketContentHash,
  uploadTicketScreenshot,
} from '@/lib/support/storage';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A repeat of the exact same (tenant, reporter, title, description) within this
 * window is treated as a duplicate submit and linked to the original rather than
 * creating a new ticket. Bounds accidental double-taps and automated floods.
 */
const DEDUP_WINDOW_MS = 10 * 60 * 1000;

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

/**
 * Ticket fields are attacker-controlled free text. They are interpolated into an
 * HTML email that a super admin opens, so every value must be escaped before it
 * reaches the template.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function notifySuperAdmin(ticket: {
  ticketNumber: string;
  title: string;
  description: string;
  pageUrl: string;
  tenantId: string;
  priority: TicketPriority;
  reporterName: string | null;
  reporterEmail: string | null;
  hasScreenshot: boolean;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const from = process.env.ONBOARDING_FROM_EMAIL || 'Bizosto <hello@bizosto.com>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com';
  const superAdminEmail = 'admin@bizosto.com';

  const resend = new Resend(apiKey);

  const priorityColor: Record<TicketPriority, string> = {
    urgent: '#dc2626',
    high: '#ea580c',
    medium: '#d97706',
    low: '#16a34a',
  };

  const pColor = priorityColor[ticket.priority] || '#d97706';

  const safeTicketNumber = escapeHtml(ticket.ticketNumber);
  const safeTitle = escapeHtml(ticket.title);
  const safeDescription = escapeHtml(ticket.description);
  const safeTenantId = escapeHtml(ticket.tenantId);
  const safePageUrl = ticket.pageUrl ? escapeHtml(ticket.pageUrl) : 'Not provided';
  const safeReporter = ticket.reporterName ? escapeHtml(ticket.reporterName) : 'Anonymous';
  const safeReporterEmail = ticket.reporterEmail
    ? ` &lt;${escapeHtml(ticket.reporterEmail)}&gt;`
    : '';

  await resend.emails.send({
    from,
    to: superAdminEmail,
    subject: `[${ticket.ticketNumber}] Bug Report — ${ticket.title.slice(0, 60)}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb">
        <div style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px;color:#fff;font-size:20px;font-weight:700;letter-spacing:0.08em">BIZOSTO</div>
        <div style="padding:32px 24px;background:#fff;color:#111827;line-height:1.6">
          <p style="font-size:16px;font-weight:700;margin:0 0 4px">New Bug Report Submitted</p>
          <p style="margin:0 0 20px;color:#6b7280;font-size:14px">A user has reported an issue that needs your attention.</p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;width:140px">Ticket</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600">${safeTicketNumber}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Tenant</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600">${safeTenantId}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Reporter</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px">${safeReporter}${safeReporterEmail}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Priority</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;color:${pColor}">${ticket.priority.toUpperCase()}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Page</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px">${safePageUrl}</td></tr>
            <tr><td style="padding:10px 0;font-size:14px;color:#6b7280">Screenshot</td><td style="padding:10px 0;font-size:14px">${ticket.hasScreenshot ? '✓ Attached in ticket' : 'None'}</td></tr>
          </table>

          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="font-weight:600;margin:0 0 8px">${safeTitle}</p>
            <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap">${safeDescription}</p>
          </div>

          <p style="margin:24px 0 0">
            <a href="${appUrl}/admin/support" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Ticket →</a>
          </p>
        </div>
      </div>`,
  });
}

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = normalizeTenantId(current.tenantId);

    // Tenant-scoped read of the top-level platform_tickets collection. Admins
    // see their own tenant's tickets; the cross-tenant super-admin queue is a
    // separate surface (S8).
    const tickets = await adminDb
      .collection(PLATFORM_TICKETS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    return NextResponse.json({
      tickets: tickets.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      }),
    });
  } catch (error) {
    console.error('SUPPORT_TICKETS_GET_ERROR', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // Any authenticated user in any role may file a bug report. Reading the
    // queue stays restricted to admin/super_admin on GET.
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Bounded per user + IP. Bug reports fan out to email and Storage, so an
    // unbounded POST is an inbox-flood and storage-cost vector.
    await checkRateLimit(req, 'strict', current.uid);

    // tenantId is ALWAYS derived from the authenticated session, never the body.
    const tenantId = normalizeTenantId(current.tenantId);
    const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    // Honeypot: a hidden field no human fills in. A non-empty value is a bot;
    // return 200 so the bot cannot distinguish acceptance from rejection, but
    // write nothing.
    if (typeof data?.website === 'string' && data.website.trim() !== '') {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const description = typeof data?.description === 'string' ? data.description.trim() : '';
    const pageUrl = typeof data?.pageUrl === 'string' ? data.pageUrl.trim() : '';
    const reporterName = typeof data?.reporterName === 'string' ? data.reporterName.trim() : null;
    const reporterEmail =
      typeof data?.reporterEmail === 'string' ? data.reporterEmail.trim() : null;

    if (title.length < 3 || description.length < 10) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 });
    }

    // Decode + validate the screenshot before touching Firestore. Throws a
    // user-safe message on an invalid or oversized payload.
    let screenshot;
    try {
      screenshot = parseScreenshotDataUrl(data?.screenshot);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Screenshot must be a PNG, JPEG, or WebP image.';
      const status = err instanceof Error && err.name === 'ScreenshotTooLarge' ? 413 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const priority = normalizeTicketPriority(data?.priority);
    const category = normalizeTicketCategory(data?.category);

    const contentHash = ticketContentHash({
      tenantId,
      reporterUid: current.uid,
      title,
      description,
    });

    // Dedup: link an identical repeat submitted within the window to the
    // original instead of creating a second ticket.
    const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
    const existing = await adminDb
      .collection(PLATFORM_TICKETS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('contentHash', '==', contentHash)
      .where('createdAt', '>=', dedupCutoff)
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      const existingData = doc.data();
      return NextResponse.json({
        id: doc.id,
        ticketNumber: existingData.ticketNumber,
        deduped: true,
        createdAt: toIso(existingData.createdAt),
        updatedAt: toIso(existingData.updatedAt),
      });
    }

    const now = new Date();
    const ticketRef = adminDb.collection(PLATFORM_TICKETS_COLLECTION).doc();
    const counterRef = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('support_meta')
      .doc('ticket_counter');

    // Upload the screenshot BEFORE the transaction — Storage writes cannot run
    // inside a Firestore transaction, and the URL must be part of the committed doc.
    let screenshotUrl: string | null = null;
    if (screenshot) {
      try {
        const uploaded = await uploadTicketScreenshot({
          tenantId,
          ticketId: ticketRef.id,
          screenshot,
        });
        screenshotUrl = uploaded.url;
      } catch (err) {
        // A screenshot failure must not lose the whole report. Proceed without it.
        console.error('SUPPORT_SCREENSHOT_UPLOAD_ERROR', err);
        screenshotUrl = null;
      }
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const lastNumber = counterSnap.exists ? Number(counterSnap.data()?.lastNumber || 0) : 0;
      const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      const ticketNumber = `TKT-${String(nextNumber).padStart(4, '0')}`;

      const payload = {
        tenantId,
        ticketNumber,
        title,
        description,
        pageUrl: pageUrl || null,
        reporterName: reporterName || null,
        reporterEmail: reporterEmail || null,
        screenshotUrl,
        hasScreenshot: Boolean(screenshotUrl),
        status: 'open' as TicketStatus,
        priority,
        category,
        contentHash,
        tags: Array.isArray(data?.tags)
          ? (data.tags as unknown[])
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 10)
          : [],
        // Triage is performed super-admin-side on demand, never on the tenant
        // write path. No platform AI key is reachable from this route.
        triageStatus: 'untriaged' as const,
        triage: null,
        reporter: {
          uid: current.uid,
          name:
            typeof current.name === 'string' && current.name.trim()
              ? current.name.trim()
              : reporterName || 'Unknown',
          email: typeof current.email === 'string' ? current.email : reporterEmail || '',
          role: typeof current.role === 'string' ? current.role : '',
        },
        assignedTo: null,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(counterRef, { lastNumber: nextNumber, updatedAt: now }, { merge: true });
      tx.set(ticketRef, payload);

      return { id: ticketRef.id, ...payload };
    });

    // Notify super admin — non-blocking
    notifySuperAdmin({
      ticketNumber: result.ticketNumber,
      title,
      description,
      pageUrl,
      tenantId,
      priority,
      reporterName,
      reporterEmail,
      hasScreenshot: Boolean(screenshotUrl),
    }).catch((err) => console.error('SUPPORT_NOTIFY_SUPER_ADMIN_ERROR', err));

    // Real-time in-app bell for the super admin. The notification is tagged with
    // the super admin's OWN tenant (DEFAULT_TENANT_ID) so their NotificationBell
    // — which filters by userId + their tenantId — actually surfaces it; the
    // originating tenant is carried in the body and metadata. Recipients are
    // found in that same tenant. Non-blocking: a notification failure must not
    // fail the ticket write.
    createRoleNotifications({
      roles: ['super_admin'],
      tenantId: DEFAULT_TENANT_ID,
      recipientTenantId: DEFAULT_TENANT_ID,
      type: 'support_ticket',
      entityType: 'support_ticket',
      entityId: result.id,
      title: `New bug report: ${result.ticketNumber}`,
      body: `${title} — from tenant ${tenantId}`,
      deepLink: '/super_admin/tickets',
      priority: priority === 'urgent' || priority === 'high' ? 'high' : 'normal',
      metadata: { originTenantId: tenantId, ticketNumber: result.ticketNumber, priority },
    }).catch((err) => console.error('SUPPORT_NOTIFY_BELL_ERROR', err));

    return NextResponse.json({
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    if (isAppError(error)) {
      const { status, body, headers } = resolveErrorResponse(error);
      return NextResponse.json(body, { status, headers });
    }
    console.error('SUPPORT_TICKETS_POST_ERROR', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
