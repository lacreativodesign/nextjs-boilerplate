import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getTenantBranding, updateTenantBranding, verifyEmailSender } from "@/lib/white-label/branding";

const schema = z.object({ fromEmail: z.string().email() });

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid email." }, { status: 400 });

  try {
    const verification = await verifyEmailSender(parsed.data.fromEmail);
    const current = await getTenantBranding(auth.user.tenantId);
    const now = new Date().toISOString();

    await updateTenantBranding(
      auth.user.tenantId,
      {
        emailBranding: {
          ...current.emailBranding,
          fromEmail: parsed.data.fromEmail,
          status: verification.verified ? "verified" : "pending",
          spfValid: verification.spfValid,
          dkimValid: verification.dkimValid,
          verifiedAt: verification.verified ? now : null,
        },
      },
      auth.user.uid
    );

    return NextResponse.json({ ok: true, verification });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Email verification failed" }, { status: 400 });
  }
}
