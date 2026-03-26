import React from 'react';
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

interface ScoreTrendData {
  date: string;
  archScore: number;
  secScore: number;
}

interface ScoreTrendChartProps {
  data: ScoreTrendData[];
  height?: number;
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="text-sm font-medium text-slate-900">{payload[0].payload.date}</p>
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

export const ScoreTrendChart: React.FC<ScoreTrendChartProps> = ({
  data,
  height = 300,
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
        />
        <YAxis
          domain={[0, 100]}
          stroke="#94a3b8"
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="line"
        />
        <Line
          type="monotone"
          dataKey="archScore"
          stroke="#b45309"
          strokeWidth={2}
          dot={{ fill: '#b45309', r: 4 }}
          activeDot={{ r: 6 }}
          name="Architecture Score"
          isAnimationActive={true}
        />
        <Line
          type="monotone"
          dataKey="secScore"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ fill: '#2563eb', r: 4 }}
          activeDot={{ r: 6 }}
          name="Security Score"
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
