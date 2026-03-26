import React, { useState } from 'react';
import { PipelineRun, Finding } from '../../types';
import { RunsList } from '../pipeline/RunsList';
import { RunDetail } from '../pipeline/RunDetail';

interface PipelinePageProps {
  runs: PipelineRun[];
  selectedRun?: PipelineRun;
  selectedRunFindings?: Finding[];
}

export const PipelinePage: React.FC<PipelinePageProps> = ({
  runs,
  selectedRun: initialSelectedRun,
  selectedRunFindings = [],
}) => {
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(initialSelectedRun || null);
  const [findings, setFindings] = useState<Finding[]>(selectedRunFindings);

  const handleSelectRun = (run: PipelineRun) => {
    setSelectedRun(run);
    // In a real app, you'd fetch findings here
    // For now, we just reset findings
    setFindings(selectedRunFindings.filter((f) => f.runId === run.id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Pipeline Runs</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          View and analyze pipeline runs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Runs List - Left Column */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Recent Runs
            </h3>
            <RunsList runs={runs} onSelect={handleSelectRun} />
          </div>
        </div>

        {/* Run Detail - Right Column */}
        <div className="lg:col-span-2">
          {selectedRun ? (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Run Details
              </h3>
              <RunDetail run={selectedRun} findings={findings} />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                Select a run to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
