"use client";

import { type FormEvent, useState } from "react";

type CreateProductDialogProps = {
  onSuccess: () => Promise<void>;
};

const defaultFormState = {
  name: "",
  sku: "",
  description: "",
  category: "",
  type: "physical",
  costPrice: 0,
  sellingPrice: 0,
  trackInventory: true,
  minStockLevel: 0,
  reorderPoint: 0,
  reorderQuantity: 0,
};

export function CreateProductDialog({ onSuccess }: CreateProductDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultFormState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/inventory/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create product");
      }

      await onSuccess();
      setForm(defaultFormState);
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn"
      >
        Create Product
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-xl p-6">
            <h2 className="mb-4 text-xl font-semibold">Create Product</h2>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Product name"
                  className="input"
                />
                <input
                  required
                  value={form.sku}
                  onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
                  placeholder="SKU"
                  className="input"
                />
                <input
                  required
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="Category"
                  className="input"
                />
                <select
                  value={form.type}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as typeof form.type }))}
                  className="input"
                >
                  <option value="physical">Physical</option>
                  <option value="digital">Digital</option>
                  <option value="service">Service</option>
                  <option value="bundle">Bundle</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.costPrice}
                  onChange={(event) => setForm((prev) => ({ ...prev, costPrice: Number(event.target.value) }))}
                  placeholder="Cost price"
                  className="input"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.sellingPrice}
                  onChange={(event) => setForm((prev) => ({ ...prev, sellingPrice: Number(event.target.value) }))}
                  placeholder="Selling price"
                  className="input"
                />
                <input
                  type="number"
                  min={0}
                  required
                  value={form.minStockLevel}
                  onChange={(event) => setForm((prev) => ({ ...prev, minStockLevel: Number(event.target.value) }))}
                  placeholder="Min stock level"
                  className="input"
                />
                <input
                  type="number"
                  min={0}
                  required
                  value={form.reorderPoint}
                  onChange={(event) => setForm((prev) => ({ ...prev, reorderPoint: Number(event.target.value) }))}
                  placeholder="Reorder point"
                  className="input"
                />
                <input
                  type="number"
                  min={0}
                  required
                  value={form.reorderQuantity}
                  onChange={(event) => setForm((prev) => ({ ...prev, reorderQuantity: Number(event.target.value) }))}
                  placeholder="Reorder quantity"
                  className="input"
                />
                <label className="flex items-center gap-2 input text-sm">
                  <input
                    type="checkbox"
                    checked={form.trackInventory}
                    onChange={(event) => setForm((prev) => ({ ...prev, trackInventory: event.target.checked }))}
                  />
                  Track inventory
                </label>
              </div>

              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                className="w-full input"
              />

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border px-4 py-2 text-sm"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
