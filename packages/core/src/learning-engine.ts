/**
 * Continuous Learning Engine — Closes the feedback loop
 *
 * Inspired by everything-claude-code's Stop hooks that extract patterns
 * from completed sessions and crystallize them into reusable skills.
 *
 * The Learning Engine consumes FeedbackStore data and produces:
 *   1. Skill Adjustments — tune confidence thresholds per skill/category
 *   2. Suppression Rules — auto-suppress findings with high false-positive rates
 *   3. Priority Boosts — promote categories that are consistently accepted
 *   4. Pattern Insights — extracted patterns for future pipeline optimization
 *
 * This is the "brain" that makes Nexus smarter over time.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type { FeedbackStore, TrendResult, FindingOutcome, FixOutcome } from "./feedback-store.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SkillAdjustment {
  category: string;
  adjustment: AdjustmentType;
  reason: string;
  confidence: number; // 0-1 how confident we are in this adjustment
  /** Original value (for auditing) */
  originalValue?: number;
  /** Suggested new value */
  suggestedValue?: number;
  /** Number of data points backing this */
  sampleSize: number;
}

export type AdjustmentType =
  | "suppress"            // Stop showing this category entirely
  | "lower-severity"      // Downgrade severity (e.g. high → medium)
  | "raise-severity"      // Upgrade severity (e.g. medium → high)
  | "boost-priority"      // Show this category more prominently
  | "increase-threshold"  // Require higher confidence to show
  | "decrease-threshold"; // Lower confidence requirement

export interface SuppressionRule {
  category: string;
  reason: string;
  falsePositiveRate: number;
  sampleSize: number;
  createdAt: string;
  /** Auto-expire after this many days (default: 30) */
  expiresInDays: number;
}

export interface PriorityBoost {
  category: string;
  boostFactor: number; // 1.0 = no change, >1.0 = higher priority
  reason: string;
  acceptanceRate: number;
  sampleSize: number;
}

export interface PatternInsight {
  type: "correlation" | "trend" | "anomaly" | "recommendation";
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
}

export interface LearningReport {
  timestamp: string;
  dataPoints: number;
  adjustments: SkillAdjustment[];
  suppressions: SuppressionRule[];
  boosts: PriorityBoost[];
  insights: PatternInsight[];
  /** Overall learning quality (0-100) — higher when we have more data */
  learningQuality: number;
}

export interface LearningConfig {
  /** Minimum false positive rate to suggest suppression (default: 0.4 = 40%) */
  suppressionThreshold: number;
  /** Minimum acceptance rate for priority boost (default: 0.8 = 80%) */
  boostThreshold: number;
  /** Minimum samples before making adjustments (default: 10) */
  minSamples: number;
  /** Days after which suppression rules auto-expire (default: 30) */
  suppressionExpiryDays: number;
  /** Max fix revert rate before lowering auto-fix confidence (default: 0.3) */
  maxRevertRate: number;
}

const DEFAULT_CONFIG: LearningConfig = {
  suppressionThreshold: 0.4,
  boostThreshold: 0.8,
  minSamples: 10,
  suppressionExpiryDays: 30,
  maxRevertRate: 0.3,
};

// ═══════════════════════════════════════════════════════════════
// LEARNING ENGINE
// ═══════════════════════════════════════════════════════════════

export class LearningEngine {
  private config: LearningConfig;

  constructor(config: Partial<LearningConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze feedback data and produce a learning report.
   * This is the main entry point — call periodically (e.g. end of sprint).
   */
  async analyze(store: FeedbackStore): Promise<LearningReport> {
    const trends = await store.queryTrends();
    const allOutcomes = await this.getAllOutcomes(store);
    const fixOutcomes = await this.getAllFixOutcomes(store);

    const adjustments = this.computeAdjustments(allOutcomes, fixOutcomes);
    const suppressions = this.computeSuppressions(allOutcomes);
    const boosts = this.computeBoosts(allOutcomes);
    const insights = this.computeInsights(trends, allOutcomes, fixOutcomes);

    const dataPoints = allOutcomes.length + fixOutcomes.length + trends.runs;
    const learningQuality = this.assessLearningQuality(dataPoints, allOutcomes.length);

    return {
      timestamp: new Date().toISOString(),
      dataPoints,
      adjustments,
      suppressions,
      boosts,
      insights,
      learningQuality,
    };
  }

  /**
   * Given a finding category and the learning report, should this finding be shown?
   */
  shouldShow(category: string, report: LearningReport): boolean {
    return !report.suppressions.some(s => s.category === category);
  }

  /**
   * Get the priority multiplier for a category.
   * Returns 1.0 if no boost, >1.0 if boosted, <1.0 if demoted.
   */
  getPriorityMultiplier(category: string, report: LearningReport): number {
    const boost = report.boosts.find(b => b.category === category);
    return boost?.boostFactor ?? 1.0;
  }

  // ─── Adjustment computation ─────────────────────────────────

  private computeAdjustments(
    outcomes: FindingOutcome[],
    fixOutcomes: FixOutcome[],
  ): SkillAdjustment[] {
    const adjustments: SkillAdjustment[] = [];
    const byCategory = this.groupByCategory(outcomes);

    for (const [category, catOutcomes] of byCategory) {
      if (catOutcomes.length < this.config.minSamples) continue;

      const total = catOutcomes.length;
      const fps = catOutcomes.filter(o => o.outcome === "false-positive").length;
      const accepted = catOutcomes.filter(o => o.outcome === "accepted").length;
      const dismissed = catOutcomes.filter(o => o.outcome === "dismissed").length;

      const fpRate = fps / total;
      const acceptRate = accepted / total;
      const dismissRate = dismissed / total;

      // High false positive rate → suggest suppression or threshold increase
      if (fpRate >= this.config.suppressionThreshold) {
        adjustments.push({
          category,
          adjustment: fpRate >= 0.6 ? "suppress" : "increase-threshold",
          reason: `False positive rate is ${(fpRate * 100).toFixed(0)}% (${fps}/${total})`,
          confidence: Math.min(fpRate, 0.95),
          sampleSize: total,
          suggestedValue: fpRate >= 0.6 ? 0 : 0.8,
        });
      }

      // High dismiss rate (but not FP) → lower severity
      if (dismissRate >= 0.5 && fpRate < 0.3) {
        adjustments.push({
          category,
          adjustment: "lower-severity",
          reason: `Dismiss rate is ${(dismissRate * 100).toFixed(0)}% — findings may be over-classified`,
          confidence: dismissRate * 0.8,
          sampleSize: total,
        });
      }

      // High acceptance rate → boost priority
      if (acceptRate >= this.config.boostThreshold) {
        adjustments.push({
          category,
          adjustment: "boost-priority",
          reason: `Acceptance rate is ${(acceptRate * 100).toFixed(0)}% — findings are consistently valuable`,
          confidence: acceptRate * 0.9,
          sampleSize: total,
        });
      }
    }

    // Check fix revert rate
    if (fixOutcomes.length >= this.config.minSamples) {
      const applied = fixOutcomes.filter(f => f.applied);
      const reverted = applied.filter(f => f.reverted);
      const revertRate = applied.length > 0 ? reverted.length / applied.length : 0;

      if (revertRate > this.config.maxRevertRate) {
        adjustments.push({
          category: "__auto-fix__",
          adjustment: "increase-threshold",
          reason: `Fix revert rate is ${(revertRate * 100).toFixed(0)}% — auto-fix confidence should be raised`,
          confidence: Math.min(revertRate, 0.9),
          sampleSize: applied.length,
          suggestedValue: 0.9,
        });
      }
    }

    return adjustments.sort((a, b) => b.confidence - a.confidence);
  }

  private computeSuppressions(outcomes: FindingOutcome[]): SuppressionRule[] {
    const suppressions: SuppressionRule[] = [];
    const byCategory = this.groupByCategory(outcomes);

    for (const [category, catOutcomes] of byCategory) {
      if (catOutcomes.length < this.config.minSamples) continue;

      const fpRate = catOutcomes.filter(o => o.outcome === "false-positive").length / catOutcomes.length;

      if (fpRate >= this.config.suppressionThreshold) {
        suppressions.push({
          category,
          reason: `False positive rate ${(fpRate * 100).toFixed(0)}% exceeds threshold ${(this.config.suppressionThreshold * 100).toFixed(0)}%`,
          falsePositiveRate: Math.round(fpRate * 100),
          sampleSize: catOutcomes.length,
          createdAt: new Date().toISOString(),
          expiresInDays: this.config.suppressionExpiryDays,
        });
      }
    }

    return suppressions.sort((a, b) => b.falsePositiveRate - a.falsePositiveRate);
  }

  private computeBoosts(outcomes: FindingOutcome[]): PriorityBoost[] {
    const boosts: PriorityBoost[] = [];
    const byCategory = this.groupByCategory(outcomes);

    for (const [category, catOutcomes] of byCategory) {
      if (catOutcomes.length < this.config.minSamples) continue;

      const acceptRate = catOutcomes.filter(o => o.outcome === "accepted").length / catOutcomes.length;

      if (acceptRate >= this.config.boostThreshold) {
        // Boost factor scales from 1.1 (80% accept) to 1.5 (100% accept)
        const boostFactor = 1.0 + (acceptRate - this.config.boostThreshold) * 2.5;

        boosts.push({
          category,
          boostFactor: Math.round(boostFactor * 100) / 100,
          reason: `Acceptance rate ${(acceptRate * 100).toFixed(0)}% indicates high value`,
          acceptanceRate: Math.round(acceptRate * 100),
          sampleSize: catOutcomes.length,
        });
      }
    }

    return boosts.sort((a, b) => b.boostFactor - a.boostFactor);
  }

  // ─── Insight computation ────────────────────────────────────

  private computeInsights(
    trends: TrendResult,
    outcomes: FindingOutcome[],
    fixOutcomes: FixOutcome[],
  ): PatternInsight[] {
    const insights: PatternInsight[] = [];

    // Trend insight
    if (trends.runs >= 5) {
      if (trends.scoreTrend === "degrading") {
        insights.push({
          type: "trend",
          title: "Codebase health is declining",
          description: `Average score ${trends.avgScore} with degrading trend over ${trends.runs} runs`,
          confidence: 0.8,
          actionable: true,
          suggestedAction: "Schedule architecture review and prioritize debt reduction",
        });
      } else if (trends.scoreTrend === "improving") {
        insights.push({
          type: "trend",
          title: "Codebase health is improving",
          description: `Average score ${trends.avgScore} with improving trend — current practices are working`,
          confidence: 0.8,
          actionable: false,
        });
      }
    }

    // Fix effectiveness insight
    if (trends.fixEffectiveness > 0) {
      if (trends.fixEffectiveness < 50) {
        insights.push({
          type: "anomaly",
          title: "Low auto-fix effectiveness",
          description: `Only ${trends.fixEffectiveness}% of auto-fixes were effective — remediation strategies need tuning`,
          confidence: 0.7,
          actionable: true,
          suggestedAction: "Review fix generation templates and increase verification strictness",
        });
      } else if (trends.fixEffectiveness >= 80) {
        insights.push({
          type: "trend",
          title: "High auto-fix effectiveness",
          description: `${trends.fixEffectiveness}% of auto-fixes were effective — remediation engine is well-tuned`,
          confidence: 0.85,
          actionable: false,
        });
      }
    }

    // Dismissed categories correlation
    if (trends.mostDismissedCategories.length > 0) {
      const topDismissed = trends.mostDismissedCategories[0];
      if (topDismissed.dismissRate > 50) {
        insights.push({
          type: "correlation",
          title: `"${topDismissed.category}" findings frequently dismissed`,
          description: `${topDismissed.dismissRate}% dismiss rate suggests this category may be miscalibrated`,
          confidence: 0.7,
          actionable: true,
          suggestedAction: `Review "${topDismissed.category}" rules and consider lowering severity or adjusting detection`,
        });
      }
    }

    // Severity distribution insight
    const severityDist = this.computeSeverityDistribution(outcomes);
    const criticalRatio = severityDist.get("critical") ?? 0;
    if (criticalRatio > 0.3 && outcomes.length >= 20) {
      insights.push({
        type: "anomaly",
        title: "High ratio of critical findings",
        description: `${(criticalRatio * 100).toFixed(0)}% of findings are critical — this may indicate over-classification`,
        confidence: 0.65,
        actionable: true,
        suggestedAction: "Review critical severity thresholds — true critical rate should be 5-15%",
      });
    }

    // Fix revert correlation with categories
    const revertedFixes = fixOutcomes.filter(f => f.applied && f.reverted);
    if (revertedFixes.length >= 3) {
      insights.push({
        type: "correlation",
        title: "Reverted fixes detected",
        description: `${revertedFixes.length} auto-fixes were reverted — check remediation quality for these finding types`,
        confidence: 0.6,
        actionable: true,
        suggestedAction: "Increase sub-agent verification strictness for auto-remediation",
      });
    }

    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  // ─── Helpers ────────────────────────────────────────────────

  private groupByCategory(outcomes: FindingOutcome[]): Map<string, FindingOutcome[]> {
    const map = new Map<string, FindingOutcome[]>();
    for (const o of outcomes) {
      const list = map.get(o.category) ?? [];
      list.push(o);
      map.set(o.category, list);
    }
    return map;
  }

  private computeSeverityDistribution(outcomes: FindingOutcome[]): Map<string, number> {
    if (outcomes.length === 0) return new Map();
    const counts = new Map<string, number>();
    for (const o of outcomes) {
      counts.set(o.severity, (counts.get(o.severity) ?? 0) + 1);
    }
    const dist = new Map<string, number>();
    for (const [sev, count] of counts) {
      dist.set(sev, count / outcomes.length);
    }
    return dist;
  }

  private assessLearningQuality(dataPoints: number, outcomeCount: number): number {
    // Quality improves logarithmically with data
    if (dataPoints === 0) return 0;

    const dataScore = Math.min(Math.log10(dataPoints + 1) * 25, 50);
    const outcomeScore = Math.min(Math.log10(outcomeCount + 1) * 25, 50);

    return Math.round(dataScore + outcomeScore);
  }

  /** Workaround: access store's persistence to get all outcomes across runs */
  private async getAllOutcomes(store: FeedbackStore): Promise<FindingOutcome[]> {
    // The store exposes queryTrends which internally calls getFindingOutcomes,
    // but we need raw access. We use a simple approach: query all runs and
    // reconstruct from trends data. For a real production system, FeedbackStore
    // would expose a dedicated method. Here we use the internal trick.
    return (store as any).persistence.getFindingOutcomes() as Promise<FindingOutcome[]>;
  }

  private async getAllFixOutcomes(store: FeedbackStore): Promise<FixOutcome[]> {
    return (store as any).persistence.getFixOutcomes() as Promise<FixOutcome[]>;
  }
}
