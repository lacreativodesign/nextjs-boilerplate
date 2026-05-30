"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast";
import type { BudgetCategory } from "@/lib/types/budget";

type EditableCategory = Pick<BudgetCategory, "id" | "name" | "type" | "monthlyBudgets">;

function createEmptyCategory(name: string, type: "revenue" | "expense"): EditableCategory {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    monthlyBudgets: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      budgeted: 0,
      actual: 0,
      variance: 0,
    })),
  };
}

export default function CreateBudgetPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<EditableCategory[]>([
    createEmptyCategory("Revenue", "revenue"),
    createEmptyCategory("Operating Expenses", "expense"),
  ]);

  const months = useMemo(() => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], []);

  const addCategory = () => {
    setCategories((prev) => [...prev, createEmptyCategory("New Category", "expense")]);
  };

  const updateCategory = (index: number, updates: Partial<EditableCategory>) => {
    setCategories((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const updateMonthlyBudget = (catIndex: number, month: number, value: number) => {
    setCategories((prev) =>
      prev.map((category, index) => {
        if (index !== catIndex) return category;
        return {
          ...category,
          monthlyBudgets: category.monthlyBudgets.map((monthly) =>
            monthly.month === month
              ? {
                  ...monthly,
                  budgeted: Number.isFinite(value) ? value : 0,
                }
              : monthly
          ),
        };
      })
    );
  };

  const deleteCategory = (index: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toastError("Please enter a budget name.");
      return;
    }

    if (categories.length === 0) {
      toastError("At least one category is required.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/finance/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          fiscalYear: year,
          currency,
          categories,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "Unable to create budget.");
      }

      toastSuccess("Budget created successfully.");
      router.push(`/admin/finance/budgets/${data.id}`);
    } catch (error) {
      console.error("Create budget error", error);
      toastError((error instanceof Error ? error.message : undefined) || "Unable to create budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Create Budget</h1>
        <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Save Budget"}</Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Budget Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Budget Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026 Annual Budget" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional budget context" />
            </div>
            <div>
              <Label>Fiscal Year</Label>
              <Input
                type="number"
                min={2000}
                max={3000}
                value={year}
                onChange={(e) => setYear(Number.parseInt(e.target.value, 10) || new Date().getFullYear())}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </CardContent>
        </Card>

        {categories.map((category, catIndex) => (
          <Card key={category.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-1 gap-2">
                  <Input
                    value={category.name}
                    onChange={(e) => updateCategory(catIndex, { name: e.target.value })}
                    className="font-semibold text-lg"
                  />
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={category.type}
                    onChange={(e) => updateCategory(catIndex, { type: e.target.value as "revenue" | "expense" })}
                  >
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteCategory(catIndex)} disabled={categories.length === 1}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-6 xl:grid-cols-12">
                {category.monthlyBudgets.map((monthly) => (
                  <div key={`${category.id}-${monthly.month}`}>
                    <Label className="text-xs">{months[monthly.month - 1]}</Label>
                    <Input
                      type="number"
                      value={monthly.budgeted}
                      onChange={(e) => updateMonthlyBudget(catIndex, monthly.month, Number.parseFloat(e.target.value) || 0)}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 text-right text-sm font-semibold">
                Total: {currency} {category.monthlyBudgets.reduce((sum, month) => sum + month.budgeted, 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button onClick={addCategory} variant="outline" className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>
    </div>
  );
}
