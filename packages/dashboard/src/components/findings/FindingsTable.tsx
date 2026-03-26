import React from 'react';
import { X } from 'lucide-react';
import { Finding } from '../../types';
import { DataTable, Column } from '../common/DataTable';
import { Badge } from '../common/Badge';
import { severityColor } from '../../lib/format';

interface FindingsTableProps {
  findings: Finding[];
  onDismiss?: (id: string) => void;
  onSelect?: (finding: Finding) => void;
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

export const FindingsTable: React.FC<FindingsTableProps> = ({
  findings,
  onDismiss,
  onSelect,
}) => {
  const columns: Column<Finding>[] = [
    {
      key: 'severity',
      label: 'Severity',
      sortable: true,
      render: (value) => (
        <Badge label={value.charAt(0).toUpperCase() + value.slice(1)} variant={severityToBadgeVariant(value)} size="sm" />
      ),
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
    },
    {
      key: 'title',
      label: 'Title',
      sortable: true,
    },
    {
      key: 'filePath',
      label: 'File',
      render: (value) => (
        <div className="font-mono text-xs text-slate-600 dark:text-slate-400">
          {value || '-'}
        </div>
      ),
    },
    {
      key: 'confidence',
      label: 'Confidence',
      sortable: true,
      render: (value) => `${Math.round(value * 100)}%`,
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <DataTable<Finding>
        columns={columns}
        data={findings}
        onRowClick={onSelect}
        emptyMessage="No findings"
      />
      {onDismiss && findings.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-400">
          Click a row to view details. Use the detail panel to dismiss findings.
        </div>
      )}
    </div>
  );
};
