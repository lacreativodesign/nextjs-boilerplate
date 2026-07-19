'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6'];

export interface ExpenseBreakdownDatum {
  category: string;
  amount: number;
}

interface ExpenseBreakdownChartProps {
  data: ExpenseBreakdownDatum[];
}

/**
 * QUAL-07: recharts-backed expense pie, split into its own client component so the
 * finance reports route can load it lazily via next/dynamic and keep recharts out
 * of the route's initial bundle.
 */
export default function ExpenseBreakdownChart({ data }: ExpenseBreakdownChartProps) {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label
          >
            {data.map((entry, index) => (
              <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
