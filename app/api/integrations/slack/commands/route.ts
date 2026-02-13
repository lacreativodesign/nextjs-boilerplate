import { NextResponse } from "next/server";
import { handleSlackSlashCommand, verifySlackSignature } from "@/lib/integrations/slack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid Slack signature." }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payload = {
    command: form.get("command") || "/bizosto",
    text: form.get("text") || "",
    user_id: form.get("user_id") || "",
    user_name: form.get("user_name") || "",
    channel_id: form.get("channel_id") || "",
    team_id: form.get("team_id") || "",
    response_url: form.get("response_url") || "",
  };

  if (!payload.team_id) {
    return NextResponse.json({ response_type: "ephemeral", text: "Missing Slack team id." }, { status: 400 });
  }

  try {
    const result = await handleSlackSlashCommand(payload);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ response_type: "ephemeral", text: error?.message || "Command failed." }, { status: 500 });
  }
}
