import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import { PurchaseOrderService } from "@/lib/inventory/purchase-order-service";

export const runtime = "nodejs";

const receiveItemsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional(),
        quantityReceived: z.number().int().positive(),
      })
    )
    .min(1),
});

function canManageInventory(role: string) {
  const normalized = role.toLowerCase();
  return isAdminOrSuper(role) || normalized === "owner" || normalized === "production_manager";
}

export async function POST(request: NextRequest, { params }: { params: { poId: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageInventory(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = receiveItemsSchema.parse(body);

    await PurchaseOrderService.receivePOItems({
      poId: params.poId,
      items: data.items,
      userId: session.uid,
      userName: session.name || session.uid,
      tenantId: session.tenantId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error receiving PO items:", error);
    const message = error instanceof Error ? error.message : "Failed to receive PO items";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
