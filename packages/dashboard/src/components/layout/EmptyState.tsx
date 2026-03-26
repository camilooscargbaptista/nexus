import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      {/* Icon */}
      <div className="mb-4 p-4 bg-slate-100 rounded-lg text-slate-600">{icon}</div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>

      {/* Description */}
      <p className="text-sm text-slate-600 text-center max-w-sm mb-6">{description}</p>

      {/* Action Button */}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
