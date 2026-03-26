import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface RunsTimelineData {
  date: string;
  runs: number;
  passed: number;
  failed: number;
}

interface RunsTimelineChartProps {
  data: RunsTimelineData[];
  height?: number;
}

const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="text-sm font-medium text-slate-900">
          {payload[0].payload.date}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const RunsTimelineChart: React.FC<RunsTimelineChartProps> = ({
  data,
  height = 300,
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
        />
        <YAxis
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
        />
        <Area
          type="monotone"
          dataKey="passed"
          stackId="runs"
          fill="#22c55e"
          stroke="#16a34a"
          name="Passed"
          isAnimationActive={true}
        />
        <Area
          type="monotone"
          dataKey="failed"
          stackId="runs"
          fill="#ef4444"
          stroke="#dc2626"
          name="Failed"
          isAnimationActive={true}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
