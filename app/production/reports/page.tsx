'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Pie,
  PieChart,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  ChartContainer,
  CHART_COLORS,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  useChartAnimation,
} from '@/components/charts/ChartContainer';

export default function ProductionReportsPage() {
  const chartAnimation = useChartAnimation();
  // --- Dummy KPI data ---
  const kpis = [
    { label: 'Projects In Queue', value: 12 },
    { label: 'Projects Completed', value: 38 },
    { label: 'Revisions This Week', value: 21 },
    { label: 'Avg Turnaround (hrs)', value: '14.8' },
  ];

  // --- Bar chart: Tasks completed per team member ---
  const barData = [
    { name: 'Ali', tasks: 18 },
    { name: 'Sara', tasks: 25 },
    { name: 'Imran', tasks: 12 },
    { name: 'Fatima', tasks: 30 },
  ];

  // --- Pie chart: Project category distribution ---
  const pieData = [
    { name: 'Branding', value: 14 },
    { name: 'Web', value: 22 },
    { name: 'Social Media', value: 18 },
    { name: 'Video/Animation', value: 9 },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Production analytics to track performance and workload.</p>
      </div>

      {/* KPI CARDS */}
      <div className="kpis">
        {kpis.map((kpi, i) => (
          <div key={i} className="card">
            <div className="helper-text mb-2">{kpi.label}</div>
            <div className="text-3xl font-bold text-[var(--text-primary)]">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* BAR CHART */}
        <ChartContainer
          title="Tasks Completed Per Member"
          description="Daily task throughput by team member."
          height={288}
        >
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="name" {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip {...chartTooltipProps} />
                <Bar
                  dataKey="tasks"
                  fill="var(--chart-series-1)"
                  radius={[8, 8, 0, 0]}
                  {...chartAnimation}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>

        {/* PIE CHART */}
        <ChartContainer
          title="Project Category Breakdown"
          description="Work distribution by service category."
          height={288}
          showLegendToggle
        >
          {({ legendVisible }) => (
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="var(--surface-card)"
                    {...chartAnimation}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  {legendVisible && (
                    <Legend
                      align="center"
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }}
                    />
                  )}
                  <Tooltip {...chartTooltipProps} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartContainer>
      </div>
    </div>
  );
}
