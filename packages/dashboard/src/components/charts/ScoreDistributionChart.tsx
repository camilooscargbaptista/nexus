import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ScoreDistributionData {
  range: string;
  count: number;
}

interface ScoreDistributionChartProps {
  data: ScoreDistributionData[];
  height?: number;
  color?: string;
}

const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="text-sm font-medium text-slate-900">
          {payload[0].payload.range}
        </p>
        <p className="text-sm" style={{ color: payload[0].color }}>
          Count: {payload[0].value}
        </p>
      </div>
    );
  }
  return null;
};

export const ScoreDistributionChart: React.FC<ScoreDistributionChartProps> = ({
  data,
  height = 250,
  color = '#b45309', // amber-700
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number"
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
        />
        <YAxis
          dataKey="range"
          type="category"
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
          width={90}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="count"
          fill={color}
          radius={[0, 8, 8, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};
