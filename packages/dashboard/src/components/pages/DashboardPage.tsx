import React from 'react';
import {
  DashboardStats,
  FindingsByCategory,
  PipelineRun,
} from '../../types';
import { StatCard } from '../layout/StatCard';
import { ScoreTrendChart, FindingsBarChart, QualityGauge, RunsTimelineChart } from '../charts';
import { DataTable, Column } from '../common/DataTable';
import { Badge } from '../common/Badge';
import { formatScore, formatRelativeTime } from '../../lib/format';
import { TrendingUp, AlertCircle, CheckCircle, Activity } from 'lucide-react';

interface DashboardPageProps {
  stats: DashboardStats;
  findingsByCategory: FindingsByCategory[];
  recentRuns: PipelineRun[];
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

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  findingsByCategory,
  recentRuns,
}) => {
  const runColumns: Column<PipelineRun>[] = [
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <Badge label={value} variant={statusToBadgeVariant(value)} size="sm" />
      ),
    },
    {
      key: 'branch',
      label: 'Branch',
    },
    {
      key: 'architectureScore',
      label: 'Arch',
      render: (value) => (value !== undefined ? `${Math.round(value)}%` : '-'),
    },
    {
      key: 'securityScore',
      label: 'Security',
      render: (value) => (value !== undefined ? `${Math.round(value)}%` : '-'),
    },
    {
      key: 'findingsCount',
      label: 'Findings',
    },
    {
      key: 'startedAt',
      label: 'Started',
      render: (value) => formatRelativeTime(value),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Runs"
          value={String(stats.totalRuns)}
          icon={<Activity size={24} />}
          color="blue"
        />
        <StatCard
          title="Pass Rate"
          value={formatScore(stats.passRate)}
          change={stats.passRate >= 80 ? 5 : -3}
          changeLabel="from last month"
          icon={<CheckCircle size={24} />}
          color="green"
        />
        <StatCard
          title="Avg Arch Score"
          value={formatScore(stats.avgArchScore)}
          icon={<TrendingUp size={24} />}
          color="amber"
        />
        <StatCard
          title="Critical Findings"
          value={String(stats.criticalFindings)}
          change={stats.criticalFindings > 0 ? -10 : 0}
          changeLabel="from last month"
          icon={<AlertCircle size={24} />}
          color="red"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Trend - 2/3 width */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Score Trends
          </h3>
          <ScoreTrendChart data={stats.trendsData} />
        </div>

        {/* Quality Gauge - 1/3 width */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 w-full">
            Quality Gate
          </h3>
          <QualityGauge
            passRate={stats.passRate}
            label={`${Math.round(stats.passRate)}%`}
          />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Findings by Category */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Findings by Category
          </h3>
          <FindingsBarChart data={findingsByCategory} />
        </div>

        {/* Runs Timeline */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Runs Timeline
          </h3>
          <RunsTimelineChart data={stats.trendsData} />
        </div>
      </div>

      {/* Recent Runs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Recent Runs
        </h3>
        <DataTable<PipelineRun>
          columns={runColumns}
          data={recentRuns.slice(0, 5)}
          emptyMessage="No recent runs"
        />
      </div>
    </div>
  );
};
