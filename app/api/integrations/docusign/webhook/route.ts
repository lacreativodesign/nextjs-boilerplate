import { NextResponse } from "next/server";
import { upsertEnvelopeStatusFromWebhook, verifyDocusignWebhookSignature } from "@/lib/integrations/docusign";

export const runtime = "nodejs";

function extractEnvelopeEvent(payload: unknown) {
  const p = payload as Record<string, unknown>;
  const data = p?.data as Record<string, unknown> | undefined;
  const summary = (data?.envelopeSummary || p?.envelopeSummary) as Record<string, unknown> | undefined;

  const envelopeId =
    data?.envelopeId ||
    summary?.envelopeId ||
    p?.envelopeId ||
    "";

  const status =
    data?.status ||
    summary?.status ||
    p?.status ||
    "";

  const completedAt = data?.completedDateTime || p?.completedDateTime || null;
  const tenantId = data?.tenantId || p?.tenantId || null;

  return {
    envelopeId: String(envelopeId || "").trim(),
    status: String(status || "").trim(),
    completedAt: completedAt ? String(completedAt) : null,
    tenantId: tenantId ? String(tenantId) : null,
  };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-docusign-signature-1");

    if (!verifyDocusignWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody || "{}");
    const event = extractEnvelopeEvent(payload);

    if (!event.envelopeId || !event.status) {
      return NextResponse.json({ ok: false, error: "envelopeId and status are required." }, { status: 400 });
    }

    await upsertEnvelopeStatusFromWebhook(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "DocuSign webhook processing failed." }, { status: 500 });
  }
}
