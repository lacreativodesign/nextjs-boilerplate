import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { InventoryService } from "@/lib/inventory/inventory-service";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  type: z.enum(["physical", "digital", "service", "bundle"]),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  trackInventory: z.boolean(),
  minStockLevel: z.number().min(0),
  reorderPoint: z.number().min(0),
  reorderQuantity: z.number().min(0),
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
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
    const data = createProductSchema.parse(body);

    const productId = await InventoryService.createProduct({
      tenantId: session.tenantId,
      ...data,
      createdBy: session.uid,
    });

    return NextResponse.json({ productId }, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    const message = error instanceof Error ? error.message : "Failed to create product";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const lowStock = searchParams.get("lowStock") === "true";

    let query: Query = adminDb.collection("products").where("tenantId", "==", session.tenantId);

    if (category) {
      query = query.where("category", "==", category);
    }
    if (status) {
      query = query.where("status", "==", status);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    let products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (lowStock) {
      products = products.filter((product) =>
        Boolean(product.trackInventory) && Number(product.currentStock as unknown ?? 0) <= Number(product.reorderPoint as unknown ?? 0)
      );
    }

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
