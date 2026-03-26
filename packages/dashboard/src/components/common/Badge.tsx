import React from 'react';
import clsx from 'clsx';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant: BadgeVariant;
  size?: BadgeSize;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-100',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-100',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-1 text-xs font-medium',
  md: 'px-3 py-1.5 text-sm font-medium',
};

export const Badge: React.FC<BadgeProps> = ({ label, variant, size = 'md' }) => {
  return (
    <span
      className={clsx(
        'inline-block rounded-full',
        variantClasses[variant],
        sizeClasses[size]
      )}
    >
      {label}
    </span>
  );
};
