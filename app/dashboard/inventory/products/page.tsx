"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductCard } from "@/components/inventory/ProductCard";
import { CreateProductDialog } from "@/components/inventory/CreateProductDialog";
import type { Product } from "@/types/inventory";

type ProductRecord = Partial<Product> & { id: string };

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "low_stock") {
        params.append("lowStock", "true");
      } else if (filter !== "all") {
        params.append("status", filter);
      }

      const response = await fetch(`/api/inventory/products?${params.toString()}`);
      const data = await response.json();
      setProducts(data.products || []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <CreateProductDialog onSuccess={fetchProducts} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {["all", "active", "low_stock", "discontinued"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded px-4 py-2 text-sm ${
              filter === status ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
            }`}
          >
            {status
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-500">Loading products...</p> : null}

      {!loading && products.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-gray-500">No products found.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
