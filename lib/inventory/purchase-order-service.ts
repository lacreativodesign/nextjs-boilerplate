import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { InventoryService } from "@/lib/inventory/inventory-service";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/inventory";

export class PurchaseOrderService {
  static async createPurchaseOrder(params: {
    tenantId: string;
    supplierId: string;
    supplierName: string;
    warehouseId: string;
    warehouseName: string;
    items: PurchaseOrderItem[];
    orderDate: Date;
    expectedDeliveryDate?: Date;
    paymentTerms?: string;
    notes?: string;
    createdBy: string;
    createdByName: string;
  }): Promise<string> {
    const poNumber = await this.generatePONumber(params.tenantId);

    const subtotal = params.items.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    const po: Omit<PurchaseOrder, "id"> = {
      tenantId: params.tenantId,
      poNumber,
      orderDate: Timestamp.fromDate(params.orderDate),
      expectedDeliveryDate: params.expectedDeliveryDate ? Timestamp.fromDate(params.expectedDeliveryDate) : undefined,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      warehouseId: params.warehouseId,
      warehouseName: params.warehouseName,
      items: params.items,
      subtotal,
      tax,
      shipping: 0,
      total,
      currency: "USD",
      status: "draft",
      paymentTerms: params.paymentTerms,
      paymentStatus: "unpaid",
      paidAmount: 0,
      receivingStatus: "pending",
      receivedItems: 0,
      totalItems: params.items.reduce((sum, item) => sum + item.quantity, 0),
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      notes: params.notes,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection("purchase_orders").add(po);

    await adminDb.collection("suppliers").doc(params.supplierId).update({
      totalOrders: admin.firestore.FieldValue.increment(1),
      lastOrderDate: Timestamp.now(),
    });

    return docRef.id;
  }

  static async receivePOItems(params: {
    poId: string;
    userId: string;
    userName: string;
    tenantId: string;
    items: Array<{
      productId: string;
      variantId?: string;
      quantityReceived: number;
    }>;
  }): Promise<void> {
    const poDoc = await adminDb.collection("purchase_orders").doc(params.poId).get();
    if (!poDoc.exists) {
      throw new Error("Purchase order not found");
    }

    const po = poDoc.data() as PurchaseOrder;
    if (po.tenantId !== params.tenantId) {
      throw new Error("Cross-tenant access denied");
    }

    const updatedItems = po.items.map((item) => {
      const receivedItem = params.items.find(
        (ri) => ri.productId === item.productId && (ri.variantId || null) === (item.variantId || null)
      );

      if (!receivedItem) {
        return item;
      }

      const nextReceived = (item.receivedQuantity || 0) + receivedItem.quantityReceived;
      if (nextReceived > item.quantity) {
        throw new Error(`Received quantity exceeds ordered quantity for SKU ${item.sku}`);
      }

      return {
        ...item,
        receivedQuantity: nextReceived,
      };
    });

    const totalReceived = updatedItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
    const receivingStatus = totalReceived >= po.totalItems ? "received" : totalReceived > 0 ? "partial" : "pending";

    await poDoc.ref.update({
      items: updatedItems,
      receivedItems: totalReceived,
      receivingStatus,
      status: receivingStatus === "received" ? "received" : po.status,
      actualDeliveryDate: receivingStatus === "received" ? Timestamp.now() : po.actualDeliveryDate,
      updatedAt: Timestamp.now(),
    });

    for (const receivedItem of params.items) {
      if (receivedItem.quantityReceived <= 0) {
        continue;
      }

      await InventoryService.adjustStock({
        tenantId: po.tenantId,
        productId: receivedItem.productId,
        variantId: receivedItem.variantId,
        warehouseId: po.warehouseId,
        quantityChange: receivedItem.quantityReceived,
        type: "increase",
        reason: "Purchase order received",
        referenceType: "purchase_order",
        referenceId: params.poId,
        userId: params.userId,
        userName: params.userName,
        notes: `Received from PO ${po.poNumber}`,
      });
    }
  }

  static async generatePONumber(tenantId: string): Promise<string> {
    const snapshot = await adminDb
      .collection("purchase_orders")
      .where("tenantId", "==", tenantId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return "PO-0001";
    }

    const lastPO = snapshot.docs[0].data() as PurchaseOrder;
    const lastNumber = Number.parseInt(lastPO.poNumber.split("-")[1] || "0", 10);
    const nextNumber = (lastNumber + 1).toString().padStart(4, "0");

    return `PO-${nextNumber}`;
  }
}
