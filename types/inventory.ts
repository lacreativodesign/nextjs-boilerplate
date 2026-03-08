import type { Timestamp } from "firebase-admin/firestore";

export type ProductType = "physical" | "digital" | "service" | "bundle";

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  category: string;
  subCategory?: string;
  brand?: string;
  manufacturer?: string;
  tags: string[];
  type: ProductType;
  status: "active" | "discontinued" | "draft";
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  currency: string;
  taxRate?: number;
  trackInventory: boolean;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  minStockLevel: number;
  maxStockLevel?: number;
  reorderPoint: number;
  reorderQuantity: number;
  weight?: number;
  weightUnit?: "kg" | "lb" | "oz";
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: "cm" | "in";
  };
  supplierId?: string;
  supplierName?: string;
  supplierSku?: string;
  leadTime?: number;
  hasVariants: boolean;
  variantAttributes?: string[];
  images: string[];
  primaryImage?: string;
  customFields?: Record<string, unknown>;
  totalPurchases: number;
  totalSales: number;
  lastPurchaseDate?: Timestamp;
  lastSaleDate?: Timestamp;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  sku: string;
  barcode?: string;
  name: string;
  attributes: Record<string, string>;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  image?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  type: "main" | "regional" | "retail" | "dropship";
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  contactPerson?: string;
  phone?: string;
  email?: string;
  managerId?: string;
  managerName?: string;
  isActive: boolean;
  isPrimary: boolean;
  totalProducts: number;
  totalValue: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockLocation {
  id: string;
  tenantId: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  variantId?: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  aisle?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
  lastCountDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  paymentTerms?: string;
  leadTime?: number;
  minimumOrderValue?: number;
  currency: string;
  rating?: number;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: Timestamp;
  status: "active" | "inactive" | "blacklisted";
  notes?: string;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type POStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partial_received"
  | "received"
  | "cancelled";

export interface PurchaseOrderItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  total: number;
  taxRate?: number;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  orderDate: Timestamp;
  expectedDeliveryDate?: Timestamp;
  actualDeliveryDate?: Timestamp;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  status: POStatus;
  paymentTerms?: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  paidAmount: number;
  receivingStatus: "pending" | "partial" | "received";
  receivedItems: number;
  totalItems: number;
  createdBy: string;
  createdByName: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  notes?: string;
  internalNotes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AdjustmentType = "increase" | "decrease" | "recount" | "transfer";

export interface StockAdjustment {
  id: string;
  tenantId: string;
  adjustmentNumber: string;
  adjustmentDate: Timestamp;
  type: AdjustmentType;
  reason: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  variantId?: string;
  productName: string;
  sku: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  costPerUnit: number;
  totalCostImpact: number;
  referenceType?: string;
  referenceId?: string;
  createdBy: string;
  createdByName: string;
  notes?: string;
  createdAt: Timestamp;
}

export interface TransferItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  receivedQuantity?: number;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  transferNumber: string;
  transferDate: Timestamp;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  items: TransferItem[];
  status: "pending" | "in_transit" | "received" | "cancelled";
  trackingNumber?: string;
  shippingCarrier?: string;
  estimatedArrival?: Timestamp;
  actualArrival?: Timestamp;
  createdBy: string;
  createdByName: string;
  receivedBy?: string;
  receivedByName?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
