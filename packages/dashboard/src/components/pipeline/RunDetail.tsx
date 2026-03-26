import React from 'react';
import { PipelineRun, Finding } from '../../types';
import { Badge } from '../common/Badge';
import { FindingsTable } from '../findings/FindingsTable';
import { formatDuration, formatDate, gateResultIcon, gateResultText, gateResultColor } from '../../lib/format';
import { Check, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface RunDetailProps {
  run: PipelineRun;
  findings: Finding[];
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

const getGateIcon = (iconName: 'check' | 'x' | 'alert-triangle') => {
  switch (iconName) {
    case 'check':
      return <Check size={20} className="text-green-600 dark:text-green-400" />;
    case 'x':
      return <X size={20} className="text-red-600 dark:text-red-400" />;
    case 'alert-triangle':
      return <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />;
  }
};

export const RunDetail: React.FC<RunDetailProps> = ({ run, findings }) => {
  return (
    <div className="space-y-6">
      {/* Run Metadata Header */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Status</p>
            <Badge label={run.status} variant={statusToBadgeVariant(run.status)} size="md" />
          </div>
          {run.branch && (
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Branch</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {run.branch}
              </p>
            </div>
          )}
          {run.commitSha && (
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Commit</p>
              <p className="font-mono text-sm text-slate-700 dark:text-slate-300">
                {run.commitSha.substring(0, 7)}
              </p>
            </div>
          )}
          {run.durationMs && (
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Duration</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatDuration(run.durationMs)}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-600 dark:text-slate-400">
          {run.startedAt && (
            <div>
              <p className="font-semibold mb-1">Started</p>
              <p>{formatDate(run.startedAt)}</p>
            </div>
          )}
          {run.completedAt && (
            <div>
              <p className="font-semibold mb-1">Completed</p>
              <p>{formatDate(run.completedAt)}</p>
            </div>
          )}
          {run.modelTier && (
            <div>
              <p className="font-semibold mb-1">Model Tier</p>
              <p>{run.modelTier}</p>
            </div>
          )}
          {run.tokensUsed !== undefined && (
            <div>
              <p className="font-semibold mb-1">Tokens Used</p>
              <p>{run.tokensUsed.toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {run.architectureScore !== undefined && (
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              Architecture Score
            </h3>
            <div className="flex items-end gap-4">
              <div className="text-4xl font-bold text-slate-900 dark:text-slate-100">
                {Math.round(run.architectureScore)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">/ 100</div>
            </div>
            <div className="mt-4 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all"
                style={{ width: `${Math.min(run.architectureScore, 100)}%` }}
              />
            </div>
          </div>
        )}

        {run.securityScore !== undefined && (
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              Security Score
            </h3>
            <div className="flex items-end gap-4">
              <div className="text-4xl font-bold text-slate-900 dark:text-slate-100">
                {Math.round(run.securityScore)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">/ 100</div>
            </div>
            <div className="mt-4 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${Math.min(run.securityScore, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Quality Gate Result */}
      {run.qualityGate && (
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          run.qualityGate === 'PASSED' && 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
          run.qualityGate === 'FAILED' && 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
          run.qualityGate === 'WARNING' && 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
        )}>
          <div className="flex items-center gap-3">
            {getGateIcon(run.qualityGate === 'PASSED' ? 'check' : run.qualityGate === 'FAILED' ? 'x' : 'alert-triangle')}
            <div>
              <h3 className={clsx(
                'text-sm font-semibold',
                run.qualityGate === 'PASSED' && 'text-green-900 dark:text-green-100',
                run.qualityGate === 'FAILED' && 'text-red-900 dark:text-red-100',
                run.qualityGate === 'WARNING' && 'text-amber-900 dark:text-amber-100'
              )}>
                Quality Gate: {gateResultText(run.qualityGate)}
              </h3>
              <p className={clsx(
                'text-sm',
                run.qualityGate === 'PASSED' && 'text-green-800 dark:text-green-200',
                run.qualityGate === 'FAILED' && 'text-red-800 dark:text-red-200',
                run.qualityGate === 'WARNING' && 'text-amber-800 dark:text-amber-200'
              )}>
                {run.qualityGate === 'PASSED' && 'All quality criteria met'}
                {run.qualityGate === 'FAILED' && 'Quality criteria not met'}
                {run.qualityGate === 'WARNING' && 'Some quality criteria at risk'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Findings Summary */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Findings ({findings.length})
        </h3>
        {findings.length > 0 ? (
          <FindingsTable findings={findings} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No findings detected</p>
        )}
      </div>
    </div>
  );
};
