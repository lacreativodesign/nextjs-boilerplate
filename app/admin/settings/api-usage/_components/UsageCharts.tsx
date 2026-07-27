'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type UsageChartsProps = {
  endpointStats: Array<{ endpoint: string; count: number }>;
  realtimePoints: Array<{ bucket: string; count: number }>;
};

export default function UsageCharts({ endpointStats, realtimePoints }: UsageChartsProps) {
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <div>
        <h4 className="font-medium text-sm mb-2">Endpoint Usage</h4>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={endpointStats.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="endpoint" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="var(--color-indigo)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h4 className="font-medium text-sm mb-2">Real-time Usage (Last 24h buckets)</h4>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={realtimePoints}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" hide />
              <YAxis />
              <Tooltip />
              <Line dataKey="count" stroke="var(--color-green)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
