import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { sendTwilioNotification, TWILIO_TRIGGER_TYPES } from "@/lib/integrations/twilio";

export const runtime = "nodejs";

const sendSchema = z.object({
  to: z.string().min(8).max(20),
  templateKey: z.enum([
    "invoice_overdue_7_days",
    "high_priority_task_assigned",
    "project_deadline_approaching",
    "payment_received",
    "leave_request_urgent_approval",
    "system_alert",
    "custom",
  ]),
  variables: z.record(z.any()).optional(),
  triggerType: z.enum(TWILIO_TRIGGER_TYPES).optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = sendSchema.parse(await request.json());
    const result = await sendTwilioNotification({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      to: body.to,
      templateKey: body.templateKey,
      variables: body.variables,
      triggerType: body.triggerType,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("twilio/send error", error);
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to send SMS." }, { status: 400 });
  }
}
