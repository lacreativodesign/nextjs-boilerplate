'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { toastError } from '@/lib/toast';
import type { Budget, YearComparison } from '@/lib/types/budget';

type BudgetDetailPageProps = { params: { id: string } };

export default function BudgetDetailPage({ params }: BudgetDetailPageProps) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [comparison, setComparison] = useState<YearComparison | null>(null);
  const [loading, setLoading] = useState(true);

  const months = useMemo(
    () => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    [],
  );

  useEffect(() => {
    const fetchBudget = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/finance/budgets?budgetId=${params.id}`, {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          throw new Error(data?.error || 'Unable to load budget.');
        }

        const selectedBudget = (data.budgets || [])[0] as Budget | undefined;
        if (!selectedBudget) {
          throw new Error('Budget not found.');
        }

        setBudget(selectedBudget);

        const comparisonRes = await fetch(
          `/api/admin/finance/budgets?year=${selectedBudget.fiscalYear}`,
          { cache: 'no-store' },
        );
        const comparisonData = await comparisonRes.json().catch(() => ({}));
        if (comparisonRes.ok && comparisonData.ok) {
          const found = (comparisonData.yearComparisons || []).find(
            (entry: YearComparison) => entry.currentYear === selectedBudget.fiscalYear,
          );
          setComparison(found || null);
        }
      } catch (error: any) {
        console.error('Budget load error', error);
        toastError(error?.message || 'Unable to load budget details.');
      } finally {
        setLoading(false);
      }
    };

    void fetchBudget();
  }, [params.id]);

  if (loading) {
    return <div className="p-6">Loading budget...</div>;
  }

  if (!budget) {
    return <div className="p-6">Budget not found.</div>;
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold">{budget.name}</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        Fiscal Year: {budget.fiscalYear} • Status: {budget.status} • Currency: {budget.currency}
      </p>

      {comparison && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Year-over-Year Comparison</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-[var(--text-muted)]">
                Current Year ({comparison.currentYear})
              </p>
              <p className="text-xl font-semibold">
                {budget.currency} {comparison.currentTotalBudget.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">
                Previous Year ({comparison.previousYear})
              </p>
              <p className="text-xl font-semibold">
                {budget.currency} {comparison.previousTotalBudget.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Change Amount</p>
              <p
                className={`text-xl font-semibold ${comparison.changeAmount < 0 ? 'text-red-500' : 'text-green-500'}`}
              >
                {budget.currency} {Math.abs(comparison.changeAmount).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Change %</p>
              <p
                className={`text-xl font-semibold ${comparison.changeAmount < 0 ? 'text-red-500' : 'text-green-500'}`}
              >
                {comparison.changePercentage.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {budget.categories.map((category) => (
        <Card key={category.id} className="mb-6">
          <CardHeader>
            <CardTitle>{category.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">Budgeted</p>
                <p className="text-2xl font-bold">
                  {budget.currency} {category.totalBudget.toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">Actual</p>
                <p className="text-2xl font-bold">
                  {budget.currency} {category.totalActual.toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">Variance</p>
                <p
                  className={`text-2xl font-bold ${category.variance < 0 ? 'text-red-500' : 'text-green-500'}`}
                >
                  {budget.currency} {Math.abs(category.variance).toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">Variance %</p>
                <p
                  className={`text-2xl font-bold ${category.variance < 0 ? 'text-red-500' : 'text-green-500'}`}
                >
                  {category.variancePercentage.toFixed(1)}%
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={category.monthlyBudgets.map((monthly, index) => ({
                  month: months[index],
                  Budgeted: monthly.budgeted,
                  Actual: monthly.actual,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Budgeted" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="Actual" stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
