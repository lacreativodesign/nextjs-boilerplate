import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import { InventoryService } from "@/lib/inventory/inventory-service";

export const runtime = "nodejs";

const adjustStockSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  warehouseId: z.string(),
  quantityChange: z.number(),
  type: z.enum(["increase", "decrease", "recount", "transfer"]),
  reason: z.string().min(1),
  notes: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});

function canManageInventory(role: string) {
  const normalized = role.toLowerCase();
  return isAdminOrSuper(role) || normalized === "owner" || normalized === "production_manager";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageInventory(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = adjustStockSchema.parse(body);

    const adjustmentId = await InventoryService.adjustStock({
      tenantId: session.tenantId,
      ...data,
      userId: session.uid,
      userName: session.name || session.uid,
    });

    return NextResponse.json({ adjustmentId }, { status: 201 });
  } catch (error) {
    console.error("Error adjusting stock:", error);
    const message = error instanceof Error ? error.message : "Failed to adjust stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
