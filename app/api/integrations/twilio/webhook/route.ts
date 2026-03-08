import { NextRequest, NextResponse } from "next/server";
import { handleTwilioWebhook, verifyTwilioWebhookSignature } from "@/lib/integrations/twilio";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let payload: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      payload = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
    } else {
      payload = (await request.json().catch(() => ({}))) as Record<string, string>;
    }

    const signature = request.headers.get("x-twilio-signature");
    const isVerified = verifyTwilioWebhookSignature({
      signature,
      url: request.url,
      params: payload,
    });

    if (!isVerified) {
      return NextResponse.json({ ok: false, error: "Invalid Twilio signature." }, { status: 403 });
    }

    await handleTwilioWebhook({
      accountSid: payload.AccountSid,
      messageSid: payload.MessageSid,
      messageStatus: payload.MessageStatus,
      errorCode: payload.ErrorCode,
      errorMessage: payload.ErrorMessage,
      from: payload.From,
      body: payload.Body,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("twilio/webhook error", error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to process webhook." }, { status: 400 });
  }
}
