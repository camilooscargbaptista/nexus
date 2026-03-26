import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';

interface QualityGaugeProps {
  score: number;
  label: string;
  size?: number;
}

const getColorByScore = (score: number): string => {
  if (score >= 80) return '#22c55e'; // green-500
  if (score >= 60) return '#d97706'; // amber-600
  return '#dc2626'; // red-600
};

const getLightColorByScore = (score: number): string => {
  if (score >= 80) return '#dcfce7'; // green-100
  if (score >= 60) return '#fef3c7'; // amber-100
  return '#fee2e2'; // red-100
};

export const QualityGauge: React.FC<QualityGaugeProps> = ({
  score,
  label,
  size = 200,
}) => {
  const remaining = 100 - score;
  const data = [
    { name: 'score', value: score },
    { name: 'remaining', value: remaining },
  ];

  const mainColor = getColorByScore(score);
  const lightColor = getLightColorByScore(score);

  return (
    <div className="flex flex-col items-center justify-center">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.35}
              outerRadius={size * 0.5}
              paddingAngle={2}
              dataKey="value"
              startAngle={180}
              endAngle={0}
            >
              <Cell fill={mainColor} />
              <Cell fill={lightColor} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="text-4xl font-bold" style={{ color: mainColor }}>
              {score}
            </div>
            <div className="text-xs text-slate-500">out of 100</div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm font-medium text-slate-700">
        {label}
      </p>
    </div>
  );
};
