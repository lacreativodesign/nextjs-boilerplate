import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { subscribeSingleContact } from "@/lib/integrations/mailchimp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";

    if (!email || !firstName || !lastName) {
      return NextResponse.json({ ok: false, error: "email, firstName, and lastName are required." }, { status: 400 });
    }

    const result = await subscribeSingleContact({
      tenantId: auth.user.tenantId,
      audienceId: typeof body.audienceId === "string" ? body.audienceId : undefined,
      customer: {
        email,
        firstName,
        lastName,
        companyName: typeof body.companyName === "string" ? body.companyName : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        type: body.type === "prospect" || body.type === "customer" || body.type === "partner" ? body.type : "lead",
        tags: Array.isArray(body.tags) ? body.tags.map((tag: unknown) => String(tag)) : [],
        industry: typeof body.industry === "string" ? body.industry : undefined,
        leadSource: typeof body.leadSource === "string" ? body.leadSource : undefined,
        emailOptIn: body.emailOptIn !== false,
        unsubscribedAt: undefined,
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to subscribe contact." }, { status: 500 });
  }
}
