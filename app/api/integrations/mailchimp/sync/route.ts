import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { syncCustomersToAudience } from "@/lib/integrations/mailchimp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "segment" || body.mode === "auto" ? body.mode : "one_time";

    const result = await syncCustomersToAudience({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      audienceId: typeof body.audienceId === "string" ? body.audienceId : undefined,
      mode,
      filter:
        body.filter && typeof body.filter === "object"
          ? {
              type: typeof body.filter.type === "string" ? body.filter.type : undefined,
              status: typeof body.filter.status === "string" ? body.filter.status : undefined,
              tags: Array.isArray(body.filter.tags) ? body.filter.tags.map((tag: unknown) => String(tag)) : undefined,
            }
          : undefined,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Mailchimp sync failed." }, { status: 500 });
  }
}
