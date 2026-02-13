import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { uploadTenantLogo } from "@/lib/white-label/branding";

const bodySchema = z.object({
  dataUrl: z.string().min(10),
  contentType: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Invalid logo payload" }, { status: 400 });
  }

  try {
    const uploaded = await uploadTenantLogo(auth.user.tenantId, body.data);
    return NextResponse.json({ ok: true, ...uploaded });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to upload logo" }, { status: 400 });
  }
}
