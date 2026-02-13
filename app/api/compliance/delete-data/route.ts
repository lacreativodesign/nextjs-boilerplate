import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { createDataDeletionRequest } from "@/lib/compliance/data-retention";

export const runtime = "nodejs";

const bodySchema = z.object({
  subjectUserId: z.string().min(1),
  mode: z.enum(["anonymize", "delete"]).default("anonymize"),
});

function canManageCompliance(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "admin" || normalized === "super_admin" || normalized === "owner";
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompliance(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const result = await createDataDeletionRequest({
    tenantId: me.tenantId,
    requestedBy: me.uid,
    subjectUserId: parsed.data.subjectUserId,
    mode: parsed.data.mode,
  });

  return NextResponse.json(result, { status: 202 });
}
