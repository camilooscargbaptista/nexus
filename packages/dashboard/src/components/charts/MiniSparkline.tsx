import React from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';

interface MiniSparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  color = '#b45309', // amber-700
  height = 60,
  width = 100,
}) => {
  // Transform data into format Recharts expects
  const chartData = data.map((value, index) => ({
    index,
    value,
  }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
