/**
 * @nexus/core — Reward Report Generator
 *
 * Gera relatórios Markdown dos rewards acumulados.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { formatTable, formatScore, formatSection } from "./markdown-format.js";
import type { RewardSummary } from "./reward-tracker.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RewardReportOptions {
  title: string;
  includeActionBreakdown: boolean;
  includeRecommendations: boolean;
}

// ═══════════════════════════════════════════════════════════════
// REWARD REPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Gera relatórios Markdown dos rewards.
 *
 * @example
 * ```ts
 * const summary = tracker.summarize();
 * const report = RewardReportGenerator.generate(summary);
 * ```
 */
export class RewardReportGenerator {
  /**
   * Gera relatório completo.
   */
  static generate(summary: RewardSummary, options?: Partial<RewardReportOptions>): string {
    const opts: RewardReportOptions = {
      title: options?.title ?? "Reward Tracker Report",
      includeActionBreakdown: options?.includeActionBreakdown ?? true,
      includeRecommendations: options?.includeRecommendations ?? true,
    };

    const sections: string[] = [];

    // Header
    sections.push(`# ${opts.title}`);
    sections.push("");
    sections.push(`**Total Rewards:** ${summary.totalRewards}`);
    sections.push(`**Average Reward:** ${summary.averageReward}`);
    sections.push(`**Success Rate:** ${formatScore(summary.successRate)}`);
    sections.push(`**Trend:** ${this.trendEmoji(summary.recentTrend)}`);
    sections.push("");

    // Signal breakdown
    const signalHeaders = ["Signal", "Count", "Percentage"];
    const signalRows = [
      ["👍 Positive", String(summary.positiveCount), `${this.pct(summary.positiveCount, summary.totalRewards)}%`],
      ["👎 Negative", String(summary.negativeCount), `${this.pct(summary.negativeCount, summary.totalRewards)}%`],
      ["😐 Neutral", String(summary.neutralCount), `${this.pct(summary.neutralCount, summary.totalRewards)}%`],
    ];
    sections.push(formatSection("Signal Breakdown", formatTable(signalHeaders, signalRows)));

    // Action type breakdown
    if (opts.includeActionBreakdown && summary.byActionType.size > 0) {
      const actionHeaders = ["Action Type", "Count", "Avg Reward", "Rating"];
      const actionRows = [...summary.byActionType.entries()]
        .sort((a, b) => b[1].avgReward - a[1].avgReward)
        .map(([type, data]) => [
          type,
          String(data.count),
          data.avgReward.toFixed(2),
          this.ratingEmoji(data.avgReward),
        ]);

      sections.push(formatSection("Action Type Performance", formatTable(actionHeaders, actionRows), 3));
    }

    // Recommendations
    if (opts.includeRecommendations) {
      sections.push(this.generateRecommendations(summary));
    }

    return sections.join("\n");
  }

  /**
   * Gera recomendações baseadas nos patterns de reward.
   */
  private static generateRecommendations(summary: RewardSummary): string {
    const recs: string[] = [];

    if (summary.successRate < 50) {
      recs.push("🔴 Success rate below 50% — consider reviewing recommendation quality");
    }

    if (summary.recentTrend === "degrading") {
      recs.push("📉 Recent trend is degrading — investigate recent changes to the pipeline");
    }

    // Find worst action types
    const worst = [...summary.byActionType.entries()]
      .filter(([, data]) => data.avgReward < 0)
      .map(([type]) => type);

    if (worst.length > 0) {
      recs.push(`⚠️ Underperforming action types: ${worst.join(", ")} — consider retraining or adjusting rules`);
    }

    if (recs.length === 0) {
      recs.push("✅ Reward signals are healthy — system is performing well");
    }

    return formatSection("Recommendations", recs.map((r, i) => `${i + 1}. ${r}`).join("\n"), 3);
  }

  private static trendEmoji(trend: string): string {
    switch (trend) {
      case "improving": return "📈 Improving";
      case "degrading": return "📉 Degrading";
      default: return "➡️ Stable";
    }
  }

  private static ratingEmoji(reward: number): string {
    if (reward >= 0.5) return "⭐⭐⭐";
    if (reward >= 0) return "⭐⭐";
    if (reward >= -0.5) return "⭐";
    return "❌";
  }

  private static pct(part: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((part / total) * 100);
  }
}
