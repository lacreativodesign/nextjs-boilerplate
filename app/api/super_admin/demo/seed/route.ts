import { type NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const { seedDemoTenant } = await import("@/lib/demo/seed");
    const result = await seedDemoTenant({ tenantId: "bizosto-demo" });

    return NextResponse.json({
      ok: true,
      message: "Demo environment seeded successfully",
      seededAt: new Date().toISOString(),
      counts: result.counts,
    });
  } catch (error) {
    console.error("super_admin/demo/seed error", error);
    return NextResponse.json(
      { ok: false, error: (error instanceof Error ? error.message : undefined) || "Failed to seed demo environment" },
      { status: 500 }
    );
  }
}
