import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface FindingsData {
  category: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface FindingsBarChartProps {
  data: FindingsData[];
  height?: number;
}

const severityColors = {
  critical: '#dc2626', // red-600
  high: '#f97316', // orange-500
  medium: '#facc15', // amber-400
  low: '#60a5fa', // blue-400
  info: '#cbd5e1', // slate-300
};

const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="text-sm font-medium text-slate-900">
          {payload[0].payload.category}
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

export const FindingsBarChart: React.FC<FindingsBarChartProps> = ({
  data,
  height = 300,
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="category"
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
        <Bar
          dataKey="critical"
          stackId="findings"
          fill={severityColors.critical}
          name="Critical"
        />
        <Bar
          dataKey="high"
          stackId="findings"
          fill={severityColors.high}
          name="High"
        />
        <Bar
          dataKey="medium"
          stackId="findings"
          fill={severityColors.medium}
          name="Medium"
        />
        <Bar
          dataKey="low"
          stackId="findings"
          fill={severityColors.low}
          name="Low"
        />
        <Bar
          dataKey="info"
          stackId="findings"
          fill={severityColors.info}
          name="Info"
        />
      </BarChart>
    </ResponsiveContainer>
  );
};
