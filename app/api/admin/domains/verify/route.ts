import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { createDomainVerificationToken, getTenantBranding, updateTenantBranding, verifyCustomDomain } from "@/lib/white-label/branding";
import { adminDb } from "@/lib/firebaseAdmin";

const schema = z.object({ domain: z.string().min(3) });

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid domain." }, { status: 400 });

  const domain = parsed.data.domain.trim().toLowerCase();
  const token = createDomainVerificationToken(auth.user.tenantId as string, domain);

  try {
    const result = await verifyCustomDomain(domain, token);
    const current = await getTenantBranding(auth.user.tenantId as string);
    const now = new Date().toISOString();
    const customDomains = [...(current.customDomains || []).filter((item) => item.domain !== domain), {
      domain,
      verificationToken: token,
      status: result.verified ? "verified" as const : "pending" as const,
      verifiedAt: result.verified ? now : null,
    }];

    await updateTenantBranding(auth.user.tenantId as string, { customDomains }, auth.user.uid);

    await adminDb.collection("tenant_domain_mappings").doc(domain).set({
      tenantId: auth.user.tenantId,
      domain,
      status: result.verified ? "verified" : "pending",
      verificationToken: token,
      verifiedAt: result.verified ? now : null,
      updatedAt: now,
      updatedBy: auth.user.uid,
    }, { merge: true });

    return NextResponse.json({ ok: true, ...result, verificationToken: token });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Domain verification failed" }, { status: 400 });
  }
}
