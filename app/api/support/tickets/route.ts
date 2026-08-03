import { NextResponse } from 'next/server';
import { getCurrentUser, isAdminRole } from '@/app/api/admin/_utils';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeTenantId } from '@/lib/tenant';
import { isAppError, resolveErrorResponse } from '@/lib/errors';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
type TicketCategory = 'bug' | 'feature' | 'question' | 'billing';

/**
 * Screenshots are stored inline on the ticket document. Firestore caps a single
 * document at 1 MiB, so the base64 payload is bounded well below that to leave
 * room for the rest of the ticket fields. The client downscales before upload;
 * this is the server-side backstop.
 */
const MAX_SCREENSHOT_CHARS = 700_000;
const SCREENSHOT_DATA_URL = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

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

function parsePriority(value: unknown): TicketPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') return value;
  return 'medium';
}

function parseCategory(value: unknown): TicketCategory {
  if (value === 'bug' || value === 'feature' || value === 'question' || value === 'billing')
    return value;
  return 'question';
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

    const tickets = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('support_tickets')
      .orderBy('createdAt', 'desc')
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

    // Bounded per user + IP. Bug reports fan out to email, so an unbounded
    // POST is an inbox-flood and storage-cost vector.
    await checkRateLimit(req, 'strict', current.uid);

    const tenantId = normalizeTenantId(current.tenantId);
    const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const description = typeof data?.description === 'string' ? data.description.trim() : '';
    const pageUrl = typeof data?.pageUrl === 'string' ? data.pageUrl.trim() : '';
    const reporterName = typeof data?.reporterName === 'string' ? data.reporterName.trim() : null;
    const reporterEmail =
      typeof data?.reporterEmail === 'string' ? data.reporterEmail.trim() : null;
    const screenshot = typeof data?.screenshot === 'string' ? data.screenshot : null;
    const screenshotName = typeof data?.screenshotName === 'string' ? data.screenshotName : null;

    if (title.length < 3 || description.length < 10) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 });
    }

    if (screenshot) {
      if (!SCREENSHOT_DATA_URL.test(screenshot)) {
        return NextResponse.json(
          { error: 'Screenshot must be a PNG, JPEG, or WebP image.' },
          { status: 400 },
        );
      }
      if (screenshot.length > MAX_SCREENSHOT_CHARS) {
        return NextResponse.json(
          { error: 'Screenshot is too large. Please attach a smaller image.' },
          { status: 413 },
        );
      }
    }

    const priority = parsePriority(data?.priority);
    const category = parseCategory(data?.category);

    const now = new Date();
    const ticketCollection = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('support_tickets');
    const counterRef = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('support_meta')
      .doc('ticket_counter');
    const newTicketRef = ticketCollection.doc();

    const result = await adminDb.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const lastNumber = counterSnap.exists ? Number(counterSnap.data()?.lastNumber || 0) : 0;
      const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      const ticketNumber = `TKT-${String(nextNumber).padStart(4, '0')}`;

      const payload = {
        ticketNumber,
        title,
        description,
        pageUrl: pageUrl || null,
        reporterName: reporterName || null,
        reporterEmail: reporterEmail || null,
        screenshot: screenshot || null,
        screenshotName: screenshotName || null,
        hasScreenshot: Boolean(screenshot),
        status: 'open' as TicketStatus,
        priority,
        category,
        tags: Array.isArray(data?.tags)
          ? (data.tags as unknown[])
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 10)
          : [],
        // Triage is performed super-admin-side on demand, never on the tenant
        // write path. No platform AI key is reachable from this route.
        aiAnalysis: null,
        triageStatus: 'untriaged' as const,
        createdBy: {
          uid: current.uid,
          name:
            typeof current.name === 'string' && current.name.trim()
              ? current.name.trim()
              : 'Unknown',
          email: typeof current.email === 'string' ? current.email : '',
          role: typeof current.role === 'string' ? current.role : '',
        },
        assignedTo: null,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(counterRef, { lastNumber: nextNumber, updatedAt: now }, { merge: true });
      tx.set(newTicketRef, payload);

      return { id: newTicketRef.id, ...payload };
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
      hasScreenshot: Boolean(screenshot),
    }).catch((err) => console.error('SUPPORT_NOTIFY_SUPER_ADMIN_ERROR', err));

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
