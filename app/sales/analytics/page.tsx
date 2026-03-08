"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  ChartContainer,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from "@/components/charts/ChartContainer";

export default function SalesAnalyticsPage() {
  const chartAnimation = useChartAnimation();
  // Dummy analytics — replace later with Firestore data
  const monthlySales = [
    { month: "Jan", value: 12000 },
    { month: "Feb", value: 14500 },
    { month: "Mar", value: 18000 },
    { month: "Apr", value: 16500 },
    { month: "May", value: 21000 },
    { month: "Jun", value: 25000 },
  ];

  const leadConversion = [
    { stage: "New", count: 45 },
    { stage: "Contacted", count: 30 },
    { stage: "Qualified", count: 18 },
    { stage: "Proposal", count: 10 },
    { stage: "Closed Won", count: 6 },
  ];

  return (
    <div className="p-6 space-y-10">
      {/* Page Title */}
      <h1 className="text-2xl font-bold">Sales Analytics</h1>

      {/* --- Monthly Revenue Chart --- */}
      <ChartContainer title="Monthly Revenue" description="Trend line for the last six months." height={350}>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={monthlySales}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="month" {...chartAxisProps} />
            <YAxis {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--chart-series-1)"
              strokeWidth={2.5}
              dot={false}
              {...chartAnimation}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* --- Pipeline Chart --- */}
      <ChartContainer title="Lead Pipeline Overview" description="Conversion counts by stage." height={350}>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={leadConversion}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="stage" {...chartAxisProps} />
            <YAxis {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar dataKey="count" fill="var(--chart-series-2)" radius={[8, 8, 0, 0]} {...chartAnimation} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
