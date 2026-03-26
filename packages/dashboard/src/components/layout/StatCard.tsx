import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

type ColorType = 'amber' | 'green' | 'red' | 'blue' | 'slate';

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color?: ColorType;
}

const colorClasses: Record<ColorType, { bg: string; text: string }> = {
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

const changeColors = {
  positive: 'text-green-600',
  negative: 'text-red-600',
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon,
  color = 'slate',
}) => {
  const { bg, text } = colorClasses[color];
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      {/* Header with Icon */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${bg} ${text}`}>{icon}</div>
      </div>

      {/* Change Indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-1">
          <div className={`flex items-center gap-0.5 ${isPositive ? changeColors.positive : changeColors.negative}`}>
            {isPositive ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            <span className="text-sm font-semibold">{Math.abs(change)}%</span>
          </div>
          {changeLabel && <span className="text-sm text-slate-500">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
};
