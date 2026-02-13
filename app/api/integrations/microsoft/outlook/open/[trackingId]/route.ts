import { markOutlookTrackingOpen } from "@/lib/integrations/outlook";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+M8QAAAAASUVORK5CYII=", "base64");

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ trackingId: string }> }) {
  const params = await context.params;
  await markOutlookTrackingOpen(params.trackingId).catch(() => false);

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
