import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSuperAdmin } from '../../../_utils';
import { PLATFORM_TICKETS_COLLECTION } from '@/lib/support/types';
import { resolveTicketScreenshotPath } from '@/lib/support/storage';
import {
  downloadRefusal,
  mintProtectedDownloadUrl,
  protectedDownloadError,
  protectedDownloadResponse,
} from '@/lib/storage/protected-download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ ticketId: string }> };

/**
 * P0-07 — view one support-ticket screenshot. super_admin only.
 *
 * Screenshots are captures of a customer's screen and may show anything that was on it.
 * They used to be linked by a permanent tokenized Firebase URL stored on the ticket; now
 * this route checks super_admin on every request, resolves the ticket's own object
 * (tenants/{tenantId}/support/{ticketId}.{ext} — nothing else can be signed through here),
 * and redirects to an inline signed URL that expires in minutes.
 *
 * Legacy tickets that only carry `screenshotUrl` are served the same way: the object path
 * is recovered from the URL and the token in it is discarded, never followed.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    try {
      await requireSuperAdmin(req);
    } catch (err) {
      const message = (err as Error | null)?.message;
      return message === 'Forbidden'
        ? downloadRefusal(403, 'Forbidden')
        : downloadRefusal(401, 'Unauthorized');
    }

    const ticketId = String((await context.params).ticketId || '').trim();
    if (!ticketId || ticketId.includes('/')) return downloadRefusal(404, 'Ticket not found');

    const snap = await adminDb.collection(PLATFORM_TICKETS_COLLECTION).doc(ticketId).get();
    if (!snap.exists) return downloadRefusal(404, 'Ticket not found');
    const data = snap.data() || {};

    const storagePath = resolveTicketScreenshotPath({ id: ticketId, ...data });
    if (!storagePath) return downloadRefusal(404, 'This ticket has no screenshot.');

    const tenantId = String(data.tenantId || '');
    const minted = await mintProtectedDownloadUrl({
      storagePath,
      tenantId,
      allowedRoots: [`tenants/${tenantId}/support/`],
      fileName: storagePath.split('/').pop() || 'screenshot',
      disposition: 'inline',
    });
    return protectedDownloadResponse(req, minted);
  } catch (error) {
    return protectedDownloadError(error, 'support-screenshot');
  }
}
