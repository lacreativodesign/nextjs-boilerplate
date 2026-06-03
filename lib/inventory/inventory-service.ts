import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { NotificationService } from "@/lib/notifications/notification-service";
import type { AdjustmentType, Product, ProductType, StockAdjustment, StockLocation, Warehouse } from "@/types/inventory";

export class InventoryService {
  static async createProduct(params: {
    tenantId: string;
    name: string;
    sku: string;
    description?: string;
    category: string;
    type: ProductType;
    costPrice: number;
    sellingPrice: number;
    trackInventory: boolean;
    minStockLevel: number;
    reorderPoint: number;
    reorderQuantity: number;
    supplierId?: string;
    supplierName?: string;
    createdBy: string;
  }): Promise<string> {
    const normalizedSku = params.sku.trim().toUpperCase();
    const existingProduct = await this.getProductBySku(normalizedSku, params.tenantId);
    if (existingProduct) {
      throw new Error("Product with this SKU already exists");
    }

    const now = Timestamp.now();

    const product: Omit<Product, "id"> = {
      tenantId: params.tenantId,
      name: params.name,
      sku: normalizedSku,
      description: params.description,
      category: params.category,
      tags: [],
      type: params.type,
      status: "active",
      costPrice: params.costPrice,
      sellingPrice: params.sellingPrice,
      currency: "USD",
      trackInventory: params.trackInventory,
      currentStock: 0,
      reservedStock: 0,
      availableStock: 0,
      minStockLevel: params.minStockLevel,
      reorderPoint: params.reorderPoint,
      reorderQuantity: params.reorderQuantity,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      hasVariants: false,
      images: [],
      totalPurchases: 0,
      totalSales: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection("products").add({
      ...product,
      createdBy: params.createdBy,
    });

    return docRef.id;
  }

  static async adjustStock(params: {
    tenantId: string;
    productId: string;
    variantId?: string;
    warehouseId: string;
    quantityChange: number;
    type: AdjustmentType;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    userId: string;
    userName: string;
    notes?: string;
  }): Promise<string> {
    const productDoc = await adminDb.collection("products").doc(params.productId).get();
    if (!productDoc.exists) {
      throw new Error("Product not found");
    }

    const product = productDoc.data() as Product;
    if (product.tenantId !== params.tenantId) {
      throw new Error("Cross-tenant access denied");
    }

    const warehouseDoc = await adminDb.collection("warehouses").doc(params.warehouseId).get();
    if (!warehouseDoc.exists) {
      throw new Error("Warehouse not found");
    }

    const warehouse = warehouseDoc.data() as Warehouse;
    if (warehouse.tenantId !== params.tenantId) {
      throw new Error("Cross-tenant access denied");
    }

    const stockLocation = await this.getStockLocation(
      params.tenantId,
      params.warehouseId,
      params.productId,
      params.variantId
    );

    const quantityBefore = stockLocation?.quantity ?? 0;
    const quantityAfter = quantityBefore + params.quantityChange;

    if (quantityAfter < 0) {
      throw new Error("Cannot reduce stock below zero");
    }

    const adjustmentNumber = await this.generateAdjustmentNumber(params.tenantId);
    const now = Timestamp.now();

    const adjustment: Omit<StockAdjustment, "id"> = {
      tenantId: params.tenantId,
      adjustmentNumber,
      adjustmentDate: now,
      type: params.type,
      reason: params.reason,
      warehouseId: params.warehouseId,
      warehouseName: warehouse.name,
      productId: params.productId,
      variantId: params.variantId,
      productName: product.name,
      sku: product.sku,
      quantityBefore,
      quantityChange: params.quantityChange,
      quantityAfter,
      costPerUnit: product.costPrice,
      totalCostImpact: params.quantityChange * product.costPrice,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      createdBy: params.userId,
      createdByName: params.userName,
      notes: params.notes,
      createdAt: now,
    };

    const adjRef = await adminDb.collection("stock_adjustments").add(adjustment);

    if (stockLocation) {
      await adminDb.collection("stock_locations").doc(stockLocation.id).update({
        quantity: quantityAfter,
        availableQuantity: quantityAfter - stockLocation.reservedQuantity,
        updatedAt: now,
      });
    } else {
      await adminDb.collection("stock_locations").add({
        tenantId: params.tenantId,
        warehouseId: params.warehouseId,
        warehouseName: warehouse.name,
        productId: params.productId,
        variantId: params.variantId ?? null,
        quantity: quantityAfter,
        reservedQuantity: 0,
        availableQuantity: quantityAfter,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.updateProductTotalStock(params.productId, params.tenantId);
    await this.checkLowStockAlert(params.productId, params.tenantId);

    return adjRef.id;
  }

  static async updateProductTotalStock(productId: string, tenantId: string): Promise<void> {
    const locationsSnapshot = await adminDb.collection("stock_locations").where("productId", "==", productId).get();

    let totalStock = 0;
    let totalReserved = 0;

    locationsSnapshot.docs.forEach((doc) => {
      const location = doc.data() as StockLocation;
      if (location.tenantId !== tenantId) {
        return;
      }
      totalStock += location.quantity || 0;
      totalReserved += location.reservedQuantity || 0;
    });

    await adminDb.collection("products").doc(productId).update({
      currentStock: totalStock,
      reservedStock: totalReserved,
      availableStock: totalStock - totalReserved,
      updatedAt: Timestamp.now(),
    });
  }

  static async checkLowStockAlert(productId: string, tenantId: string): Promise<void> {
    const productDoc = await adminDb.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return;
    }

    const product = productDoc.data() as Product;
    if (product.tenantId !== tenantId || !product.trackInventory) {
      return;
    }

    if (product.currentStock <= product.reorderPoint) {
      const usersSnapshot = await adminDb
        .collection("users")
        .where("tenantId", "==", product.tenantId)
        .where("role", "in", ["admin", "owner", "super_admin"])
        .get();

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        if (!user.email) {
          continue;
        }

        await NotificationService.send({
          tenantId: product.tenantId,
          userId: userDoc.id,
          userEmail: user.email,
          type: "warning",
          title: "Low stock alert",
          message: `${product.name} (${product.sku}) is low on stock: ${product.currentStock} units remaining`,
          category: "operations",
          priority: "high",
          actionUrl: `/dashboard/inventory/products`,
          relatedResourceType: "product",
          relatedResourceId: productId,
        });
      }
    }
  }

  static async getStockLocation(
    tenantId: string,
    warehouseId: string,
    productId: string,
    variantId?: string
  ): Promise<(StockLocation & { id: string }) | null> {
    let query = adminDb
      .collection("stock_locations")
      .where("tenantId", "==", tenantId)
      .where("warehouseId", "==", warehouseId)
      .where("productId", "==", productId);

    if (variantId) {
      query = query.where("variantId", "==", variantId);
    } else {
      query = query.where("variantId", "==", null);
    }

    const snapshot = await query.limit(1).get();
    if (snapshot.empty) {
      return null;
    }

    return { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as Omit<StockLocation, 'id'>) };
  }

  static async getProductBySku(sku: string, tenantId: string): Promise<(Product & { id: string }) | null> {
    const snapshot = await adminDb
      .collection("products")
      .where("tenantId", "==", tenantId)
      .where("sku", "==", sku.toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as Omit<Product, 'id'>) };
  }

  static async generateAdjustmentNumber(tenantId: string): Promise<string> {
    const snapshot = await adminDb
      .collection("stock_adjustments")
      .where("tenantId", "==", tenantId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return "ADJ-0001";
    }

    const lastAdj = snapshot.docs[0].data() as StockAdjustment;
    const lastNumber = Number.parseInt(lastAdj.adjustmentNumber.split("-")[1] || "0", 10);
    const nextNumber = (lastNumber + 1).toString().padStart(4, "0");

    return `ADJ-${nextNumber}`;
  }

  static async reserveStock(params: {
    tenantId: string;
    warehouseId: string;
    productId: string;
    variantId?: string;
    quantity: number;
    referenceType: string;
    referenceId: string;
  }): Promise<void> {
    const stockLocation = await this.getStockLocation(
      params.tenantId,
      params.warehouseId,
      params.productId,
      params.variantId
    );

    if (!stockLocation) {
      throw new Error("Stock location not found");
    }

    if (stockLocation.availableQuantity < params.quantity) {
      throw new Error("Insufficient stock available");
    }

    await adminDb.collection("stock_locations").doc(stockLocation.id).update({
      reservedQuantity: admin.firestore.FieldValue.increment(params.quantity),
      availableQuantity: admin.firestore.FieldValue.increment(-params.quantity),
      updatedAt: Timestamp.now(),
    });

    await this.updateProductTotalStock(params.productId, params.tenantId);
  }

  static async releaseStock(params: {
    tenantId: string;
    warehouseId: string;
    productId: string;
    variantId?: string;
    quantity: number;
  }): Promise<void> {
    const stockLocation = await this.getStockLocation(
      params.tenantId,
      params.warehouseId,
      params.productId,
      params.variantId
    );

    if (!stockLocation) {
      return;
    }

    await adminDb.collection("stock_locations").doc(stockLocation.id).update({
      reservedQuantity: admin.firestore.FieldValue.increment(-params.quantity),
      availableQuantity: admin.firestore.FieldValue.increment(params.quantity),
      updatedAt: Timestamp.now(),
    });

    await this.updateProductTotalStock(params.productId, params.tenantId);
  }
}
