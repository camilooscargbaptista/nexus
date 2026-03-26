import React from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Finding } from '../../types';
import { Badge } from '../common/Badge';
import { severityColor } from '../../lib/format';

interface FindingDetailProps {
  finding: Finding;
  onDismiss?: () => void;
  onClose: () => void;
}

const severityToBadgeVariant = (severity: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    case 'info':
      return 'neutral';
    default:
      return 'neutral';
  }
};

const layerColors: Record<string, string> = {
  perception: 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-100',
  validation: 'bg-purple-50 text-purple-700 dark:bg-purple-900 dark:text-purple-100',
  reasoning: 'bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-100',
  autonomy: 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-100',
};

export const FindingDetail: React.FC<FindingDetailProps> = ({
  finding,
  onDismiss,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-white dark:bg-slate-900 shadow-lg overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {finding.title}
            </h2>
            <div className="flex items-center gap-2">
              <Badge
                label={finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
                variant={severityToBadgeVariant(finding.severity)}
                size="sm"
              />
              <span className={clsx(
                'px-2 py-1 text-xs font-medium rounded',
                layerColors[finding.layer] || 'bg-gray-100 text-gray-700'
              )}>
                {finding.layer}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Category */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Category
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {finding.category}
            </p>
          </div>

          {/* File Location */}
          {finding.filePath && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Location
              </h3>
              <div className="bg-slate-50 dark:bg-slate-950 rounded p-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                <div>{finding.filePath}</div>
                {finding.line && <div className="text-slate-500 dark:text-slate-400">Line {finding.line}</div>}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Description
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
              {finding.description}
            </p>
          </div>

          {/* Suggestion */}
          {finding.suggestion && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Suggestion
              </h3>
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3">
                <p className="text-sm text-green-800 dark:text-green-100 whitespace-pre-wrap">
                  {finding.suggestion}
                </p>
              </div>
            </div>
          )}

          {/* Confidence */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Confidence
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${finding.confidence * 100}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-fit">
                {Math.round(finding.confidence * 100)}%
              </span>
            </div>
          </div>

          {/* Metadata */}
          {Object.keys(finding.metadata).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Metadata
              </h3>
              <div className="bg-slate-50 dark:bg-slate-950 rounded p-3 overflow-auto max-h-40">
                <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                  {JSON.stringify(finding.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Dismiss
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
