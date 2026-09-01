import { NextRequest, NextResponse } from 'next/server';
import { handleTwilioWebhook, verifyTwilioWebhookSignature } from '@/lib/integrations/twilio';
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  releaseWebhookEvent,
} from '@/lib/stripe/webhook-idempotency';
import { webhookEventKey } from '@/lib/webhooks/event-key';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: Record<string, string> = {};

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await request.formData();
      payload = Object.fromEntries(
        Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
      );
    } else {
      payload = (await request.json().catch(() => ({}))) as Record<string, string>;
    }

    const signature = request.headers.get('x-twilio-signature');
    const isVerified = verifyTwilioWebhookSignature({
      signature,
      url: request.url,
      params: payload,
    });

    if (!isVerified) {
      return NextResponse.json({ ok: false, error: 'Invalid Twilio signature.' }, { status: 403 });
    }

    // SOC2 F-10: claimed only AFTER signature verification, so an unauthenticated
    // caller cannot pre-register a key and cause the real delivery to be dropped.
    //
    // A MessageSid is unique per message and a status callback fires once per
    // transition, so sid + status is stable across Twilio retries and distinct for
    // each real transition. If a delivery ever arrives without a sid, the serialized
    // payload is hashed instead so the request is still de-duplicated.
    const eventType = `twilio.${String(payload.MessageStatus || 'inbound').toLowerCase()}`;
    const eventKey = webhookEventKey(
      'twilio',
      [payload.MessageSid, payload.MessageStatus],
      JSON.stringify(payload),
    );

    const claim = await claimWebhookEvent(eventKey, eventType);
    if (claim === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    try {
      await handleTwilioWebhook({
        accountSid: payload.AccountSid,
        messageSid: payload.MessageSid,
        messageStatus: payload.MessageStatus,
        errorCode: payload.ErrorCode,
        errorMessage: payload.ErrorMessage,
        from: payload.From,
        body: payload.Body,
      });
    } catch (processingError) {
      // Release so Twilio's next retry re-processes instead of being swallowed.
      await releaseWebhookEvent(eventKey);
      throw processingError;
    }

    await finalizeWebhookEvent(eventKey, eventType);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('twilio/webhook error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to process webhook.' },
      { status: 400 },
    );
  }
}
