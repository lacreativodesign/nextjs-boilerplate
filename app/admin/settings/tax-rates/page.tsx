'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TaxCalculator, TaxRate } from '@/lib/tax/taxCalculator';
import { apiFetch } from '@/lib/api/client';

type NewRateState = {
  name: string;
  rate: number;
  type: 'simple' | 'compound';
  applies_to: 'subtotal' | 'subtotal_plus_other_taxes';
  enabled: boolean;
  description: string;
};

const DEFAULT_NEW_RATE: NewRateState = {
  name: '',
  rate: 0,
  type: 'simple',
  applies_to: 'subtotal',
  enabled: true,
  description: '',
};

export default function TaxRatesPage() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [newRate, setNewRate] = useState<NewRateState>(DEFAULT_NEW_RATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTaxRates = async () => {
    try {
      setError(null);
      const response = await apiFetch('/api/admin/finance/tax-rates', {
        method: 'GET',
        cache: 'no-store',
      });

      const result = await response.json();
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to fetch tax rates');
      }

      setTaxRates(Array.isArray(result.taxRates) ? (result.taxRates as TaxRate[]) : []);
    } catch (fetchError: any) {
      console.error('tax rates fetch error', fetchError);
      setError(fetchError?.message || 'Failed to fetch tax rates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxRates();
  }, []);

  const handleAddRate = async () => {
    if (!newRate.name.trim() || newRate.rate <= 0) {
      setError('Tax name and a positive rate are required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        ...newRate,
        name: newRate.name.trim(),
        description: newRate.description.trim() || undefined,
      };

      const response = await apiFetch('/api/admin/finance/tax-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to create tax rate');
      }

      setTaxRates((prev) => [...prev, result.taxRate as TaxRate]);
      setNewRate(DEFAULT_NEW_RATE);
    } catch (saveError: any) {
      console.error('tax rates create error', saveError);
      setError(saveError?.message || 'Failed to create tax rate');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (taxRate: TaxRate) => {
    try {
      setError(null);
      const nextEnabled = !taxRate.enabled;

      const response = await apiFetch('/api/admin/finance/tax-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taxRate.id, enabled: nextEnabled }),
      });

      const result = await response.json();
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to update tax rate');
      }

      setTaxRates((prev) =>
        prev.map((item) => (item.id === taxRate.id ? { ...item, enabled: nextEnabled } : item)),
      );
    } catch (toggleError: any) {
      console.error('tax rates toggle error', toggleError);
      setError(toggleError?.message || 'Failed to update tax rate');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tax rate?')) return;

    try {
      setError(null);
      const response = await apiFetch(`/api/admin/finance/tax-rates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to delete tax rate');
      }

      setTaxRates((prev) => prev.filter((rate) => rate.id !== id));
    } catch (deleteError: any) {
      console.error('tax rates delete error', deleteError);
      setError(deleteError?.message || 'Failed to delete tax rate');
    }
  };

  const preview = useMemo(() => {
    const calculator = new TaxCalculator(taxRates);
    return calculator.calculate(100);
  }, [taxRates]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Tax Rates</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Add Tax Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>Tax Name</Label>
              <Input
                value={newRate.name}
                onChange={(e) => setNewRate((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="State Sales Tax"
              />
            </div>
            <div>
              <Label>Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newRate.rate}
                onChange={(e) => setNewRate((prev) => ({ ...prev, rate: Number(e.target.value) }))}
                placeholder="6.50"
              />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="w-full rounded border p-2"
                value={newRate.type}
                onChange={(e) =>
                  setNewRate((prev) => ({
                    ...prev,
                    type: e.target.value as NewRateState['type'],
                    applies_to: e.target.value === 'compound' ? prev.applies_to : 'subtotal',
                  }))
                }
              >
                <option value="simple">Simple</option>
                <option value="compound">Compound</option>
              </select>
            </div>
            <div>
              <Label>Applies To</Label>
              <select
                className="w-full rounded border p-2"
                value={newRate.applies_to}
                onChange={(e) =>
                  setNewRate((prev) => ({
                    ...prev,
                    applies_to: e.target.value as NewRateState['applies_to'],
                  }))
                }
                disabled={newRate.type === 'simple'}
              >
                <option value="subtotal">Subtotal</option>
                <option value="subtotal_plus_other_taxes">Subtotal + other taxes</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <Label>Description (Optional)</Label>
              <Input
                value={newRate.description}
                onChange={(e) => setNewRate((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Tax applicability notes"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddRate} className="w-full" disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Add Rate'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured Tax Rates</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading tax rates...</p>
          ) : (
            <div className="space-y-3">
              {taxRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between rounded border p-4">
                  <div className="flex-1">
                    <h3 className="font-semibold">{rate.name}</h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      {rate.rate}% • {rate.type === 'simple' ? 'Simple' : 'Compound'} •{' '}
                      {rate.applies_to === 'subtotal' ? 'Base: subtotal' : 'Base: subtotal + tax'}
                    </p>
                    {rate.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">{rate.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <Switch checked={rate.enabled} onCheckedChange={() => handleToggle(rate)} />
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(rate.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}

              {taxRates.length === 0 && (
                <p className="py-8 text-center text-[var(--text-muted)]">No tax rates configured</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax Calculation Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>$100.00</span>
            </div>

            {preview.taxDetails.map((tax) => (
              <div key={tax.name} className="flex justify-between text-sm text-[var(--text-muted)]">
                <span>
                  {tax.name} ({tax.rate}%):
                </span>
                <span>${tax.amount.toFixed(2)}</span>
              </div>
            ))}

            <div className="flex justify-between text-sm">
              <span>Total Tax:</span>
              <span>${preview.totalTax.toFixed(2)}</span>
            </div>

            <div className="flex justify-between border-t pt-2 font-bold">
              <span>Total:</span>
              <span>${preview.total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
