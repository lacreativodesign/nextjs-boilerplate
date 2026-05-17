import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { getAllowedBrandFonts, getTenantBranding, updateTenantBranding } from "@/lib/white-label/branding";

const brandingSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  tagline: z.string().trim().max(80).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().min(1),
  themeMode: z.enum(["light", "dark", "system"]),
  emailBranding: z.object({
    fromName: z.string().min(1),
    fromEmail: z.string().email(),
    emailFooter: z.string().min(1),
  }),
});

export async function GET() {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const branding = await getTenantBranding(auth.user.tenantId);
  return NextResponse.json({ ok: true, branding, fonts: getAllowedBrandFonts() });
}

export async function PUT(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const payload = brandingSchema.safeParse(await req.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ ok: false, error: payload.error.issues[0]?.message || "Invalid payload" }, { status: 400 });
  }

  try {
    const branding = await updateTenantBranding(auth.user.tenantId, payload.data, auth.user.uid);
    return NextResponse.json({ ok: true, branding });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to update branding" }, { status: 400 });
  }
}
