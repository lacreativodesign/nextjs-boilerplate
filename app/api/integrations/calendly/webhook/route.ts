import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { handleCalendlyWebhookByTenant, verifyCalendlyWebhookSignature } from "@/lib/integrations/calendly";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody || "{}") as { event?: string; payload?: { organization?: string } };
    const organizationUri = String(payload?.payload?.organization || "").trim();
    if (!organizationUri) {
      return NextResponse.json({ ok: false, error: "Missing organization in Calendly webhook payload." }, { status: 400 });
    }

    const snap = await adminDb.collectionGroup("integrations").where("organizationUri", "==", organizationUri).where("connected", "==", true).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "No tenant integration found for webhook organization." }, { status: 404 });
    }

    const doc = snap.docs[0];
    const tenantId = doc.ref.parent.parent?.id;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Unable to resolve tenant for Calendly webhook." }, { status: 500 });
    }

    const signature = request.headers.get("calendly-webhook-signature");
    const timestamp = request.headers.get("calendly-webhook-signature-timestamp");
    const verified = await verifyCalendlyWebhookSignature({
      tenantId,
      signature,
      body: rawBody,
      timestampHeader: timestamp,
    });

    if (!verified) {
      return NextResponse.json({ ok: false, error: "Invalid Calendly webhook signature." }, { status: 403 });
    }

    await handleCalendlyWebhookByTenant({ tenantId, payload });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("POST /api/integrations/calendly/webhook", error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to process Calendly webhook." }, { status: 400 });
  }
}
