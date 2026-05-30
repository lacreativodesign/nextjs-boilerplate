import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { getMailchimpIntegration, listMailchimpAudiences, updateMailchimpSettings } from "@/lib/integrations/mailchimp";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const integration = await getMailchimpIntegration(auth.user.tenantId as string);
    if (!integration?.connected) {
      return NextResponse.json({
        ok: true,
        connected: false,
        audiences: [],
        connection: integration,
      });
    }

    const audiences = await listMailchimpAudiences(auth.user.tenantId as string);
    return NextResponse.json({ ok: true, connected: true, audiences, connection: integration });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to list Mailchimp audiences." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    await updateMailchimpSettings(auth.user.tenantId as string, auth.user.uid, {
      autoSyncEnabled: typeof body.autoSyncEnabled === "boolean" ? body.autoSyncEnabled : undefined,
      defaultAudienceId: body.defaultAudienceId === null || typeof body.defaultAudienceId === "string" ? body.defaultAudienceId : undefined,
      tagMapping:
        body.tagMapping && typeof body.tagMapping === "object"
          ? Object.fromEntries(
              Object.entries(body.tagMapping as Record<string, unknown>).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.map((item) => String(item)) : [],
              ])
            )
          : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to update Mailchimp settings." }, { status: 500 });
  }
}
