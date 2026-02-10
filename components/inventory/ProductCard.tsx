"use client";

import type { Product } from "@/types/inventory";

type ProductCardProps = {
  product: Partial<Product> & { id: string };
};

export function ProductCard({ product }: ProductCardProps) {
  const lowStock =
    Boolean(product.trackInventory) && Number(product.currentStock ?? 0) <= Number(product.reorderPoint ?? 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{product.name || "Unnamed product"}</h3>
          <p className="text-xs text-gray-500">SKU: {product.sku || "N/A"}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            product.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
          }`}
        >
          {product.status || "draft"}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-700">
        <p>Category: {product.category || "Uncategorized"}</p>
        <p>Price: ${Number(product.sellingPrice ?? 0).toFixed(2)}</p>
        <p>Cost: ${Number(product.costPrice ?? 0).toFixed(2)}</p>
        <p>Stock: {Number(product.currentStock ?? 0)}</p>
      </div>

      {lowStock ? (
        <p className="mt-3 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Low stock alert</p>
      ) : null}
    </div>
  );
}
