import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getTwilioIntegration, TWILIO_TRIGGER_TYPES, updateTwilioIntegration } from "@/lib/integrations/twilio";

export const runtime = "nodejs";

const updateSchema = z.object({
  enabled: z.boolean(),
  fromNumber: z.string().trim().max(20).nullable(),
  messagingServiceSid: z.string().trim().max(64).nullable(),
  statusCallbackUrl: z.string().trim().url().nullable().optional(),
  enabledTriggers: z.array(z.enum(TWILIO_TRIGGER_TYPES)),
});

export async function GET() {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const connection = await getTwilioIntegration(auth.user.tenantId as string);

    return NextResponse.json({
      ok: true,
      connection: {
        enabled: Boolean(connection?.enabled),
        fromNumber: connection?.fromNumber || process.env.TWILIO_FROM_NUMBER || null,
        messagingServiceSid: connection?.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || null,
        statusCallbackUrl: connection?.statusCallbackUrl || `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ""}/api/integrations/twilio/webhook` || null,
        enabledTriggers: connection?.enabledTriggers || [...TWILIO_TRIGGER_TYPES],
        hasCredentials: Boolean(connection?.accountSid || process.env.TWILIO_ACCOUNT_SID) && Boolean(connection?.authToken || process.env.TWILIO_AUTH_TOKEN),
      },
    });
  } catch (error) {
    console.error("twilio/connection GET error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to load Twilio configuration." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = updateSchema.parse(await request.json());

    await updateTwilioIntegration({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      enabled: body.enabled,
      fromNumber: body.fromNumber,
      messagingServiceSid: body.messagingServiceSid,
      statusCallbackUrl: body.statusCallbackUrl,
      enabledTriggers: body.enabledTriggers,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("twilio/connection PATCH error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to update Twilio configuration." }, { status: 400 });
  }
}
