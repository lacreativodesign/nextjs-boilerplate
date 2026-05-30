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
  const payload = JSON.parse(payloadRaw) as unknown;

  try {
    const action = (payload as Record<string, unknown>)?.actions?.[0];
    const result = await updateSlackInteractiveAction({
      teamId: String((payload as Record<string, unknown>)?.team?.id as unknown || ""),
      actionId: String(action?.action_id || ""),
      value: String(action?.value || ""),
      actorSlackUserId: String((payload as Record<string, unknown>)?.user?.id as unknown || ""),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ text: (error instanceof Error ? error.message : undefined) || "Action failed." }, { status: 500 });
  }
}
