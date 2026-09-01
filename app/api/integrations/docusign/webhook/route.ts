import { NextResponse } from 'next/server';
import {
  upsertEnvelopeStatusFromWebhook,
  verifyDocusignWebhookSignature,
} from '@/lib/integrations/docusign';
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  releaseWebhookEvent,
} from '@/lib/stripe/webhook-idempotency';
import { webhookEventKey } from '@/lib/webhooks/event-key';

export const runtime = 'nodejs';

function extractEnvelopeEvent(payload: any) {
  const envelopeId =
    payload?.data?.envelopeId ||
    payload?.data?.envelopeSummary?.envelopeId ||
    payload?.envelopeId ||
    payload?.envelopeSummary?.envelopeId ||
    '';

  const status =
    payload?.data?.status ||
    payload?.data?.envelopeSummary?.status ||
    payload?.status ||
    payload?.envelopeSummary?.status ||
    '';

  const completedAt = payload?.data?.completedDateTime || payload?.completedDateTime || null;

  // SOC2 F-23: `tenantId` is deliberately NOT read from the payload. Bizosto never puts
  // a tenantId into the envelope it sends to DocuSign, so Connect cannot return one —
  // the only way this field could ever be populated is by a caller choosing it. The
  // tenant is resolved from the stored envelope instead.
  return {
    envelopeId: String(envelopeId || '').trim(),
    status: String(status || '').trim(),
    completedAt: completedAt ? String(completedAt) : null,
  };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-docusign-signature-1');

    if (!verifyDocusignWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody || '{}');
    const event = extractEnvelopeEvent(payload);

    if (!event.envelopeId || !event.status) {
      return NextResponse.json(
        { ok: false, error: 'envelopeId and status are required.' },
        { status: 400 },
      );
    }

    // SOC2 F-10: claimed only AFTER signature verification, so an unauthenticated
    // caller cannot pre-register a key and cause the real delivery to be dropped.
    //
    // An envelope id plus its status is stable across DocuSign Connect retries and
    // distinct for each real transition (sent, delivered, completed), so it is a
    // better key than a body hash, whose timestamps differ between retries.
    const eventType = `docusign.${event.status.toLowerCase()}`;
    const eventKey = webhookEventKey('docusign', [event.envelopeId, event.status], rawBody);

    const claim = await claimWebhookEvent(eventKey, eventType);
    if (claim === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    try {
      await upsertEnvelopeStatusFromWebhook(event);
    } catch (processingError) {
      // Release so DocuSign's next retry re-processes instead of being swallowed.
      await releaseWebhookEvent(eventKey);
      throw processingError;
    }

    await finalizeWebhookEvent(eventKey, eventType);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'DocuSign webhook processing failed.' },
      { status: 500 },
    );
  }
}
