import { NextResponse } from "next/server";
import { updateSlackInteractiveAction, verifySlackSignature } from "@/lib/integrations/slack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid Slack signature." }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payloadRaw = form.get("payload") || "{}";
  const payload = JSON.parse(payloadRaw) as any;

  try {
    const action = payload?.actions?.[0];
    const result = await updateSlackInteractiveAction({
      teamId: String(payload?.team?.id || ""),
      actionId: String(action?.action_id || ""),
      value: String(action?.value || ""),
      actorSlackUserId: String(payload?.user?.id || ""),
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ text: error?.message || "Action failed." }, { status: 500 });
  }
}
