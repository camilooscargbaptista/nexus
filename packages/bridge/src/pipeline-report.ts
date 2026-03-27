/**
 * @nexus/bridge — Pipeline Report Generator
 *
 * Gera relatório Markdown da execução do pipeline autônomo.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { formatTable, formatSection } from "@nexus/core";
import type { PipelineResult } from "./pipeline-orchestrator.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PipelineReportOptions {
  title: string;
  includeStepDetails: boolean;
  includeTimings: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE REPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Gera relatórios Markdown de execuções do pipeline.
 */
export class PipelineReportGenerator {
  /**
   * Gera relatório completo.
   */
  static generate(result: PipelineResult, options?: Partial<PipelineReportOptions>): string {
    const opts: PipelineReportOptions = {
      title: options?.title ?? "Pipeline Execution Report",
      includeStepDetails: options?.includeStepDetails ?? true,
      includeTimings: options?.includeTimings ?? true,
    };

    const sections: string[] = [];

    // Header
    sections.push(`# ${opts.title}`);
    sections.push("");
    sections.push(`**Query:** ${result.query}`);
    sections.push(`**Status:** ${this.statusEmoji(result.status)}`);
    sections.push(`**Progress:** ${result.progress}%`);
    sections.push(`**Duration:** ${result.durationMs}ms`);
    sections.push("");

    // Step details
    if (opts.includeStepDetails) {
      const headers = ["Step", "Action", "Status", "Duration"];
      const rows = result.steps.map((step) => [
        step.name,
        step.action,
        this.stepStatusEmoji(step.status),
        step.durationMs ? `${step.durationMs}ms` : "-",
      ]);

      sections.push(formatSection("Execution Steps", formatTable(headers, rows)));
    }

    // Summary
    const completed = result.steps.filter((s) => s.status === "completed").length;
    const failed = result.steps.filter((s) => s.status === "failed").length;
    const skipped = result.steps.filter((s) => s.status === "skipped").length;

    sections.push(formatSection("Summary", [
      `- ✅ Completed: ${completed}`,
      `- ❌ Failed: ${failed}`,
      `- ⏭️ Skipped: ${skipped}`,
      `- 📊 Total: ${result.steps.length}`,
    ].join("\n"), 3));

    return sections.join("\n");
  }

  private static statusEmoji(status: string): string {
    switch (status) {
      case "success": return "✅ Success";
      case "partial": return "⚠️ Partial";
      case "failed": return "❌ Failed";
      default: return status;
    }
  }

  private static stepStatusEmoji(status: string): string {
    switch (status) {
      case "completed": return "✅";
      case "failed": return "❌";
      case "running": return "🔄";
      case "skipped": return "⏭️";
      case "pending": return "⏳";
      default: return status;
    }
  }
}
