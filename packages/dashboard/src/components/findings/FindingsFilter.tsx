import React, { useState } from 'react';
import clsx from 'clsx';

export interface FindingFilters {
  severity?: string[];
  category?: string[];
  layer?: string[];
  dismissed?: boolean;
}

interface FindingsFilterProps {
  onFilter: (filters: FindingFilters) => void;
  severityCounts: Record<string, number>;
}

const severityOptions = ['critical', 'high', 'medium', 'low', 'info'];
const layerOptions = ['perception', 'validation', 'reasoning', 'autonomy'];

export const FindingsFilter: React.FC<FindingsFilterProps> = ({
  onFilter,
  severityCounts,
}) => {
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [excludeDismissed, setExcludeDismissed] = useState(true);

  const handleSeverityChange = (severity: string) => {
    const updated = selectedSeverities.includes(severity)
      ? selectedSeverities.filter((s) => s !== severity)
      : [...selectedSeverities, severity];
    setSelectedSeverities(updated);
    applyFilters(updated, selectedLayers, excludeDismissed);
  };

  const handleLayerChange = (layer: string) => {
    const updated = selectedLayers.includes(layer)
      ? selectedLayers.filter((l) => l !== layer)
      : [...selectedLayers, layer];
    setSelectedLayers(updated);
    applyFilters(selectedSeverities, updated, excludeDismissed);
  };

  const handleDismissedChange = (checked: boolean) => {
    setExcludeDismissed(checked);
    applyFilters(selectedSeverities, selectedLayers, checked);
  };

  const applyFilters = (severities: string[], layers: string[], dismissed: boolean) => {
    const filters: FindingFilters = {};
    if (severities.length > 0) filters.severity = severities;
    if (layers.length > 0) filters.layer = layers;
    filters.dismissed = dismissed;
    onFilter(filters);
  };

  const resetFilters = () => {
    setSelectedSeverities([]);
    setSelectedLayers([]);
    setExcludeDismissed(true);
    onFilter({ dismissed: true });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Severity
        </h3>
        <div className="space-y-2">
          {severityOptions.map((severity) => (
            <label key={severity} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSeverities.includes(severity)}
                onChange={() => handleSeverityChange(severity)}
                className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </span>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                {severityCounts[severity] || 0}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Layer
        </h3>
        <div className="space-y-2">
          {layerOptions.map((layer) => (
            <label key={layer} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedLayers.includes(layer)}
                onChange={() => handleLayerChange(layer)}
                className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {layer.charAt(0).toUpperCase() + layer.slice(1)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeDismissed}
            onChange={(e) => handleDismissedChange(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Hide dismissed
          </span>
        </label>
      </div>

      {(selectedSeverities.length > 0 || selectedLayers.length > 0) && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <button
            onClick={resetFilters}
            className="w-full px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
};
