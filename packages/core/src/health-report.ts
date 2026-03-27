/**
 * @nexus/core — Health Report Generator
 *
 * Gera relatórios Markdown de saúde a partir dos snapshots
 * do HealthSupervisor e StressDetector.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { formatTable, formatScore, formatSeverity, formatDiff, formatSection } from "./markdown-format.js";
import type { HealthSnapshot } from "./health-supervisor.js";
import type { StressReport } from "./stress-detector.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface HealthReportOptions {
  /** Incluir seção de trends — default true */
  includeTrends: boolean;
  /** Incluir seção de stress — default true */
  includeStress: boolean;
  /** Incluir recomendações — default true */
  includeRecommendations: boolean;
  /** Título do relatório */
  title: string;
}

// ═══════════════════════════════════════════════════════════════
// HEALTH REPORT GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Gera relatórios Markdown de saúde do codebase.
 *
 * @example
 * ```ts
 * const report = HealthReportGenerator.generate(healthSnapshot, stressReport);
 * // Returns formatted Markdown string with tables, scores, severity badges
 * ```
 */
export class HealthReportGenerator {
  /**
   * Gera relatório completo combinando health snapshot + stress report.
   */
  static generate(
    health: HealthSnapshot,
    stress?: StressReport,
    options?: Partial<HealthReportOptions>,
  ): string {
    const opts: HealthReportOptions = {
      includeTrends: options?.includeTrends ?? true,
      includeStress: options?.includeStress ?? true,
      includeRecommendations: options?.includeRecommendations ?? true,
      title: options?.title ?? "Codebase Health Report",
    };

    const sections: string[] = [];

    // Header
    sections.push(`# ${opts.title}`);
    sections.push("");
    sections.push(`**Generated:** ${new Date(health.timestamp).toISOString()}`);
    sections.push(`**Overall Status:** ${formatSeverity(health.overallStatus)}`);
    sections.push(`**Health Score:** ${formatScore(health.overallScore)}`);
    sections.push("");

    // Health Signals
    sections.push(this.generateSignalsSection(health));

    // Trends
    if (opts.includeTrends && (health.degradations.length > 0 || health.improvements.length > 0)) {
      sections.push(this.generateTrendsSection(health));
    }

    // Stress Report
    if (opts.includeStress && stress) {
      sections.push(this.generateStressSection(stress));
    }

    // Recommendations
    if (opts.includeRecommendations && stress) {
      sections.push(this.generateRecommendationsSection(stress));
    }

    return sections.join("\n");
  }

  /**
   * Gera seção de sinais de saúde.
   */
  private static generateSignalsSection(health: HealthSnapshot): string {
    const headers = ["Signal", "Value", "Status", "Trend"];
    const rows = health.signals.map((s) => [
      s.name,
      String(s.value),
      this.statusEmoji(s.severity),
      this.trendEmoji(s.trend),
    ]);

    const table = formatTable(headers, rows);
    return formatSection("Health Signals", table);
  }

  /**
   * Gera seção de tendências.
   */
  private static generateTrendsSection(health: HealthSnapshot): string {
    const lines: string[] = [];

    if (health.improvements.length > 0) {
      lines.push("**Improving ✅**");
      for (const signal of health.improvements) {
        lines.push(`- ${signal.name}: ${signal.description}`);
      }
      lines.push("");
    }

    if (health.degradations.length > 0) {
      lines.push("**Degrading ⚠️**");
      for (const signal of health.degradations) {
        lines.push(`- ${signal.name}: ${signal.description}`);
      }
    }

    return formatSection("Trends", lines.join("\n"), 3);
  }

  /**
   * Gera seção de stress.
   */
  private static generateStressSection(stress: StressReport): string {
    const lines: string[] = [];

    lines.push(`**Stress Level:** ${this.stressEmoji(stress.stressLevel)} (Score: ${stress.stressScore}/100)`);
    lines.push("");

    if (stress.hotspots.length > 0) {
      lines.push("**Hotspots:**");
      for (const hotspot of stress.hotspots) {
        lines.push(`- \`${hotspot}\``);
      }
      lines.push("");
    }

    if (stress.indicators.length > 0) {
      const headers = ["Issue", "Count", "Severity", "Category"];
      const rows = stress.indicators.slice(0, 10).map((i) => [
        i.description,
        String(i.count),
        this.statusEmoji(i.severity === "low" ? "healthy" : i.severity === "medium" ? "warning" : "critical"),
        i.category,
      ]);

      lines.push(formatTable(headers, rows));
    }

    return formatSection("Stress Analysis", lines.join("\n"), 3);
  }

  /**
   * Gera seção de recomendações.
   */
  private static generateRecommendationsSection(stress: StressReport): string {
    if (stress.recommendations.length === 0) return "";

    const lines = stress.recommendations.map((r, i) => `${i + 1}. ${r}`);
    return formatSection("Recommendations", lines.join("\n"), 3);
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private static statusEmoji(severity: string): string {
    switch (severity) {
      case "healthy": return "🟢";
      case "warning": return "🟡";
      case "critical": return "🔴";
      default: return "⚪";
    }
  }

  private static trendEmoji(trend: string): string {
    switch (trend) {
      case "improving": return "📈";
      case "degrading": return "📉";
      case "stable": return "➡️";
      default: return "❓";
    }
  }

  private static stressEmoji(level: string): string {
    switch (level) {
      case "low": return "🟢 Low";
      case "moderate": return "🟡 Moderate";
      case "high": return "🟠 High";
      case "critical": return "🔴 Critical";
      default: return "❓ Unknown";
    }
  }
}
