import React, { useState } from 'react';
import { Finding, FindingsByCategory } from '../../types';
import { FindingsFilter, FindingFilters } from '../findings/FindingsFilter';
import { FindingsTable } from '../findings/FindingsTable';
import { FindingDetail } from '../findings/FindingDetail';
import { Badge } from '../common/Badge';

interface FindingsPageProps {
  findings: Finding[];
  findingsByCategory: FindingsByCategory[];
}

const calculateSeverityCounts = (findings: Finding[]): Record<string, number> => {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  findings.forEach((f) => {
    if (counts[f.severity] !== undefined) {
      counts[f.severity]++;
    }
  });

  return counts;
};

const applyFilters = (findings: Finding[], filters: FindingFilters): Finding[] => {
  return findings.filter((finding) => {
    if (filters.severity && filters.severity.length > 0) {
      if (!filters.severity.includes(finding.severity)) {
        return false;
      }
    }
    if (filters.layer && filters.layer.length > 0) {
      if (!filters.layer.includes(finding.layer)) {
        return false;
      }
    }
    if (filters.dismissed === false && finding.dismissed) {
      return false;
    }
    return true;
  });
};

export const FindingsPage: React.FC<FindingsPageProps> = ({
  findings,
  findingsByCategory,
}) => {
  const [filters, setFilters] = useState<FindingFilters>({ dismissed: true });
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [dismissedFindings, setDismissedFindings] = useState<Set<string>>(new Set());

  const severityCounts = calculateSeverityCounts(findings);
  const filteredFindings = applyFilters(
    findings.filter((f) => !dismissedFindings.has(f.id)),
    filters
  );

  const handleDismiss = (findingId: string) => {
    setDismissedFindings((prev) => new Set(prev).add(findingId));
    setSelectedFinding(null);
  };

  const criticalCount = findings.filter((f) => f.severity === 'critical' && !dismissedFindings.has(f.id)).length;
  const dismissedCount = dismissedFindings.size;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Findings</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {findings.length - dismissedCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Critical</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">
            {criticalCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Dismissed</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {dismissedCount}
          </p>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Filter Sidebar */}
        <div className="lg:col-span-1">
          <FindingsFilter
            onFilter={setFilters}
            severityCounts={severityCounts}
          />
        </div>

        {/* Right: Table */}
        <div className="lg:col-span-3">
          <FindingsTable
            findings={filteredFindings}
            onSelect={setSelectedFinding}
            onDismiss={handleDismiss}
          />
        </div>
      </div>

      {/* Finding Detail Panel */}
      {selectedFinding && (
        <FindingDetail
          finding={selectedFinding}
          onDismiss={() => handleDismiss(selectedFinding.id)}
          onClose={() => setSelectedFinding(null)}
        />
      )}
    </div>
  );
};
