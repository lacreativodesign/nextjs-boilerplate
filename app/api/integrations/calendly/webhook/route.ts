import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  handleCalendlyWebhookByTenant,
  verifyCalendlyWebhookSignature,
} from '@/lib/integrations/calendly';
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  releaseWebhookEvent,
} from '@/lib/stripe/webhook-idempotency';
import { webhookEventKey } from '@/lib/webhooks/event-key';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody || '{}') as {
      event?: string;
      payload?: { organization?: string };
    };
    const organizationUri = String(payload?.payload?.organization || '').trim();
    if (!organizationUri) {
      return NextResponse.json(
        { ok: false, error: 'Missing organization in Calendly webhook payload.' },
        { status: 400 },
      );
    }

    const snap = await adminDb
      .collectionGroup('integrations')
      .where('organizationUri', '==', organizationUri)
      .where('connected', '==', true)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json(
        { ok: false, error: 'No tenant integration found for webhook organization.' },
        { status: 404 },
      );
    }

    const doc = snap.docs[0];
    const tenantId = doc.ref.parent.parent?.id;
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Unable to resolve tenant for Calendly webhook.' },
        { status: 500 },
      );
    }

    const signature = request.headers.get('calendly-webhook-signature');
    const timestamp = request.headers.get('calendly-webhook-signature-timestamp');
    const verified = await verifyCalendlyWebhookSignature({
      tenantId,
      signature,
      body: rawBody,
      timestampHeader: timestamp,
    });

    if (!verified) {
      return NextResponse.json(
        { ok: false, error: 'Invalid Calendly webhook signature.' },
        { status: 403 },
      );
    }

    // SOC2 F-10: claimed only AFTER signature verification. Claiming first would let
    // an unauthenticated caller pre-register an event key and cause the real Calendly
    // delivery to be discarded as a duplicate.
    //
    // Calendly sends no first-class event id, so the raw body is the key basis: a
    // redelivery is byte-identical, while distinct events carry their own invitee URI
    // and creation timestamp.
    const eventType = String(payload?.event || 'calendly.unknown');
    const eventKey = webhookEventKey('calendly', [], rawBody);

    const claim = await claimWebhookEvent(eventKey, eventType);
    if (claim === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    try {
      await handleCalendlyWebhookByTenant({ tenantId, payload });
    } catch (processingError) {
      // Release the claim so Calendly's next retry can re-process rather than being
      // silently swallowed as a duplicate.
      await releaseWebhookEvent(eventKey);
      throw processingError;
    }

    await finalizeWebhookEvent(eventKey, eventType);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('POST /api/integrations/calendly/webhook', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to process Calendly webhook.' },
      { status: 400 },
    );
  }
}
