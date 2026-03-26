import React from 'react';
import { PipelineRun } from '../../types';
import { Badge } from '../common/Badge';
import { formatDuration, formatRelativeTime } from '../../lib/format';
import clsx from 'clsx';

interface RunsListProps {
  runs: PipelineRun[];
  onSelect?: (run: PipelineRun) => void;
}

const statusToBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'RUNNING':
      return 'warning';
    case 'PENDING':
      return 'info';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
};

const getStatusAnimation = (status: string): string => {
  return status === 'RUNNING' ? 'animate-pulse' : '';
};

export const RunsList: React.FC<RunsListProps> = ({ runs, onSelect }) => {
  return (
    <div className="space-y-2">
      {runs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
          <p className="text-slate-500 dark:text-slate-400">No pipeline runs</p>
        </div>
      ) : (
        runs.map((run) => (
          <div
            key={run.id}
            onClick={() => onSelect?.(run)}
            className={clsx(
              'bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4',
              'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    label={run.status}
                    variant={statusToBadgeVariant(run.status)}
                    size="sm"
                  />
                  {run.branch && (
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {run.branch}
                    </span>
                  )}
                </div>
                {run.commitSha && (
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {run.commitSha.substring(0, 7)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatRelativeTime(run.startedAt)}
                </p>
                {run.durationMs && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDuration(run.durationMs)}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {run.architectureScore !== undefined && (
                <div className="bg-slate-50 dark:bg-slate-950 rounded p-2">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Arch</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {Math.round(run.architectureScore)}%
                  </p>
                </div>
              )}
              {run.securityScore !== undefined && (
                <div className="bg-slate-50 dark:bg-slate-950 rounded p-2">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Security</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {Math.round(run.securityScore)}%
                  </p>
                </div>
              )}
              <div className="bg-slate-50 dark:bg-slate-950 rounded p-2">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Findings</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {run.findingsCount}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 rounded p-2">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Critical</p>
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {run.criticalCount}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
