import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import { PurchaseOrderService } from "@/lib/inventory/purchase-order-service";

export const runtime = "nodejs";

const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  name: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  receivedQuantity: z.number().int().min(0).default(0),
  unitCost: z.number().min(0),
  total: z.number().min(0),
  taxRate: z.number().min(0).optional(),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().min(1),
  warehouseId: z.string().min(1),
  warehouseName: z.string().min(1),
  items: z.array(purchaseOrderItemSchema).min(1),
  orderDate: z.string().datetime(),
  expectedDeliveryDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
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
    const data = createPurchaseOrderSchema.parse(body);

    const poId = await PurchaseOrderService.createPurchaseOrder({
      tenantId: session.tenantId,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      warehouseId: data.warehouseId,
      warehouseName: data.warehouseName,
      items: data.items,
      orderDate: new Date(data.orderDate),
      expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
      paymentTerms: data.paymentTerms,
      notes: data.notes,
      createdBy: session.uid,
      createdByName: session.name || session.uid,
    });

    return NextResponse.json({ poId }, { status: 201 });
  } catch (error) {
    console.error("Error creating purchase order:", error);
    const message = error instanceof Error ? error.message : "Failed to create purchase order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status");

    let query: Query = adminDb.collection("purchase_orders").where("tenantId", "==", session.tenantId);
    if (status) {
      query = query.where("status", "==", status);
    }

    const snapshot = await query.orderBy("orderDate", "desc").limit(100).get();
    const purchaseOrders = snapshot.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ purchaseOrders });
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
  }
}
