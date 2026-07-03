import { markTrackingOpen } from '@/lib/integrations/gmail';

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: { trackingId: string } }) {
  const trackingId = String(context.params.trackingId || '').trim();
  if (trackingId) {
    await markTrackingOpen(trackingId).catch(() => undefined);
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}
