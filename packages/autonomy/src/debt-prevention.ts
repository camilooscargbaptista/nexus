/**
 * Proactive Debt Prevention — Analyze PRs against codebase trajectory
 *
 * Before merge, projects the impact of a PR on temporal scores.
 * Alerts if the PR accelerates trajectory toward anti-patterns.
 *
 * Flow:
 *   1. Snapshot current codebase scores + trajectory
 *   2. Simulate PR merge (overlay PR changes on snapshot)
 *   3. Project new trajectory with PR included
 *   4. Compare trajectories → flag accelerations toward debt
 *   5. Produce actionable verdict: merge / merge-with-warnings / block
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type { GuidanceFinding } from "@camilooscargbaptista/nexus-types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DebtPreventionConfig {
  /** Score drop threshold to trigger warning (default: 3) */
  warningThreshold?: number;
  /** Score drop threshold to trigger block (default: 8) */
  blockThreshold?: number;
  /** Look-ahead sprints for trajectory projection (default: 3) */
  projectionHorizon?: number;
  /** Weight for complexity vs coupling vs cohesion (default: equal) */
  dimensionWeights?: Partial<Record<ScoreDimension, number>>;
  /** Allow override for blocking (tech-lead can force merge) */
  allowOverride?: boolean;
}

export type ScoreDimension =
  | "complexity"
  | "coupling"
  | "cohesion"
  | "testCoverage"
  | "security"
  | "documentation";

export interface PRChangeSet {
  prId: string;
  title: string;
  author: string;
  filesChanged: PRFileChange[];
  linesAdded: number;
  linesRemoved: number;
}

export interface PRFileChange {
  path: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
  linesAdded: number;
  linesRemoved: number;
  /** Pre-computed complexity delta for this file (optional) */
  complexityDelta?: number;
}

export interface CodebaseTrajectory {
  current: DimensionScores;
  /** Historical scores from previous N sprints */
  history: { sprintId: string; scores: DimensionScores }[];
  /** Known pre-anti-patterns approaching threshold */
  approachingAntiPatterns: ApproachingPattern[];
}

export type DimensionScores = Record<ScoreDimension, number>;

export interface ApproachingPattern {
  type: string;
  module: string;
  currentSeverity: number; // 0-100, higher = worse
  threshold: number;
  sprintsUntilThreshold: number;
}

export interface DebtVerdict {
  prId: string;
  decision: "merge" | "merge-with-warnings" | "block";
  overallScoreImpact: number;
  dimensionImpacts: { dimension: ScoreDimension; before: number; after: number; delta: number }[];
  acceleratedPatterns: PatternAcceleration[];
  warnings: string[];
  blockers: string[];
  recommendations: string[];
  riskScore: number; // 0-100
}

export interface PatternAcceleration {
  pattern: string;
  module: string;
  sprintsBefore: number;
  sprintsAfter: number;
  acceleration: number; // how many sprints closer
  description: string;
}

// ═══════════════════════════════════════════════════════════════
// SCORE IMPACT ESTIMATOR
// ═══════════════════════════════════════════════════════════════

/** Adapter for computing score impact — decoupled from actual analyzers */
export interface ScoreImpactEstimator {
  /**
   * Given a change set, estimate the projected dimension scores
   * after the PR would be merged.
   */
  estimatePostMerge(
    currentScores: DimensionScores,
    changes: PRChangeSet,
  ): Promise<DimensionScores>;

  /**
   * Given projected scores, estimate new anti-pattern timeline.
   */
  projectAntiPatterns(
    current: ApproachingPattern[],
    scoreDelta: Partial<DimensionScores>,
  ): Promise<ApproachingPattern[]>;
}

// ═══════════════════════════════════════════════════════════════
// HEURISTIC ESTIMATOR (rule-based, no LLM needed)
// ═══════════════════════════════════════════════════════════════

export class HeuristicEstimator implements ScoreImpactEstimator {
  async estimatePostMerge(
    current: DimensionScores,
    changes: PRChangeSet,
  ): Promise<DimensionScores> {
    const projected = { ...current };
    const totalChurn = changes.linesAdded + changes.linesRemoved;
    const netGrowth = changes.linesAdded - changes.linesRemoved;

    // Complexity: large additions without deletions increase complexity
    if (netGrowth > 200) {
      projected.complexity = Math.max(0, projected.complexity - Math.min(5, Math.floor(netGrowth / 100)));
    } else if (netGrowth < -50) {
      projected.complexity = Math.min(100, projected.complexity + Math.min(3, Math.floor(Math.abs(netGrowth) / 100)));
    }

    // Coupling: many files changed together suggests coupling
    const filesChanged = changes.filesChanged.length;
    if (filesChanged > 15) {
      projected.coupling = Math.max(0, projected.coupling - Math.min(4, Math.floor(filesChanged / 10)));
    }

    // Test coverage: check if test files are proportional
    const testFiles = changes.filesChanged.filter(f =>
      f.path.includes("test") || f.path.includes("spec"),
    );
    const sourceFiles = changes.filesChanged.filter(f =>
      !f.path.includes("test") && !f.path.includes("spec") && !f.path.includes("config"),
    );
    if (sourceFiles.length > 0 && testFiles.length === 0) {
      projected.testCoverage = Math.max(0, projected.testCoverage - Math.min(5, sourceFiles.length));
    } else if (testFiles.length >= sourceFiles.length && sourceFiles.length > 0) {
      projected.testCoverage = Math.min(100, projected.testCoverage + 1);
    }

    // Documentation: if docs were updated
    const docFiles = changes.filesChanged.filter(f =>
      f.path.endsWith(".md") || f.path.includes("doc"),
    );
    if (sourceFiles.length > 3 && docFiles.length === 0) {
      projected.documentation = Math.max(0, projected.documentation - 1);
    }

    // Security: new files with sensitive names
    const sensitivePatterns = ["auth", "crypt", "secret", "token", "password", "credential"];
    const sensitiveChanges = changes.filesChanged.filter(f =>
      sensitivePatterns.some(p => f.path.toLowerCase().includes(p)),
    );
    if (sensitiveChanges.length > 0 && testFiles.length === 0) {
      projected.security = Math.max(0, projected.security - 2);
    }

    // Apply complexity deltas from individual files
    const totalComplexityDelta = changes.filesChanged
      .reduce((sum, f) => sum + (f.complexityDelta ?? 0), 0);
    if (totalComplexityDelta > 0) {
      projected.complexity = Math.max(0, projected.complexity - Math.min(5, totalComplexityDelta));
    }

    return projected;
  }

  async projectAntiPatterns(
    current: ApproachingPattern[],
    scoreDelta: Partial<DimensionScores>,
  ): Promise<ApproachingPattern[]> {
    return current.map(pattern => {
      // If the relevant dimension score is dropping, the pattern gets closer
      const relevantDimension = this.patternToDimension(pattern.type);
      const delta = scoreDelta[relevantDimension] ?? 0;

      if (delta < 0) {
        // Score dropped → pattern is accelerating
        const acceleration = Math.abs(delta) / 3; // rough: 3 pts drop = 1 sprint closer
        return {
          ...pattern,
          sprintsUntilThreshold: Math.max(0, pattern.sprintsUntilThreshold - acceleration),
        };
      }

      return pattern;
    });
  }

  private patternToDimension(patternType: string): ScoreDimension {
    if (patternType.includes("god") || patternType.includes("complex")) return "complexity";
    if (patternType.includes("coupling") || patternType.includes("shotgun")) return "coupling";
    if (patternType.includes("cohes")) return "cohesion";
    if (patternType.includes("test") || patternType.includes("cover")) return "testCoverage";
    if (patternType.includes("secur") || patternType.includes("vuln")) return "security";
    return "complexity";
  }
}

// ═══════════════════════════════════════════════════════════════
// DEBT PREVENTION ENGINE
// ═══════════════════════════════════════════════════════════════

const DEFAULT_WEIGHTS: Record<ScoreDimension, number> = {
  complexity: 1.0,
  coupling: 1.0,
  cohesion: 0.8,
  testCoverage: 1.2,
  security: 1.5,
  documentation: 0.5,
};

export class DebtPrevention {
  private config: Required<DebtPreventionConfig>;
  private weights: Record<ScoreDimension, number>;

  constructor(
    private estimator: ScoreImpactEstimator,
    config?: DebtPreventionConfig,
  ) {
    this.config = {
      warningThreshold: config?.warningThreshold ?? 3,
      blockThreshold: config?.blockThreshold ?? 8,
      projectionHorizon: config?.projectionHorizon ?? 3,
      dimensionWeights: config?.dimensionWeights ?? {},
      allowOverride: config?.allowOverride ?? true,
    };
    this.weights = { ...DEFAULT_WEIGHTS, ...this.config.dimensionWeights };
  }

  /**
   * Analyze a PR against the current codebase trajectory.
   */
  async analyze(
    pr: PRChangeSet,
    trajectory: CodebaseTrajectory,
  ): Promise<DebtVerdict> {
    // 1. Estimate post-merge scores
    const projectedScores = await this.estimator.estimatePostMerge(
      trajectory.current,
      pr,
    );

    // 2. Calculate dimension impacts
    const dimensions = Object.keys(trajectory.current) as ScoreDimension[];
    const dimensionImpacts = dimensions.map(dim => ({
      dimension: dim,
      before: trajectory.current[dim],
      after: projectedScores[dim],
      delta: projectedScores[dim] - trajectory.current[dim],
    }));

    // 3. Calculate weighted overall impact
    const overallScoreImpact = this.weightedImpact(dimensionImpacts);

    // 4. Calculate score deltas for anti-pattern projection
    const scoreDelta: Partial<DimensionScores> = {};
    for (const dim of dimensions) {
      const d = projectedScores[dim] - trajectory.current[dim];
      if (d !== 0) scoreDelta[dim] = d;
    }

    // 5. Project anti-pattern acceleration
    const projectedPatterns = await this.estimator.projectAntiPatterns(
      trajectory.approachingAntiPatterns,
      scoreDelta,
    );

    const acceleratedPatterns = this.detectAccelerations(
      trajectory.approachingAntiPatterns,
      projectedPatterns,
    );

    // 6. Build warnings and blockers
    const warnings: string[] = [];
    const blockers: string[] = [];
    const recommendations: string[] = [];

    for (const impact of dimensionImpacts) {
      if (impact.delta <= -this.config.blockThreshold) {
        blockers.push(
          `${impact.dimension} drops ${Math.abs(impact.delta)} pts (${impact.before} → ${impact.after}) — exceeds block threshold`,
        );
      } else if (impact.delta <= -this.config.warningThreshold) {
        warnings.push(
          `${impact.dimension} drops ${Math.abs(impact.delta)} pts (${impact.before} → ${impact.after})`,
        );
      }
    }

    for (const accel of acceleratedPatterns) {
      if (accel.sprintsAfter <= 1) {
        blockers.push(`Anti-pattern '${accel.pattern}' in ${accel.module} will breach threshold within 1 sprint`);
      } else if (accel.acceleration > 0.5) {
        warnings.push(`Anti-pattern '${accel.pattern}' in ${accel.module} accelerated by ${accel.acceleration.toFixed(1)} sprints`);
      }
    }

    // 7. Generate recommendations
    for (const impact of dimensionImpacts.filter(i => i.delta < 0)) {
      recommendations.push(
        this.recommendForDimension(impact.dimension, impact.delta, pr),
      );
    }

    // 8. Risk score
    const riskScore = this.calculateRiskScore(dimensionImpacts, acceleratedPatterns);

    // 9. Decision
    const decision = blockers.length > 0
      ? "block"
      : warnings.length > 0
        ? "merge-with-warnings"
        : "merge";

    return {
      prId: pr.prId,
      decision,
      overallScoreImpact,
      dimensionImpacts,
      acceleratedPatterns,
      warnings,
      blockers,
      recommendations: recommendations.filter(Boolean),
      riskScore,
    };
  }

  // ─── Private ────────────────────────────────────────────────

  private weightedImpact(
    impacts: { dimension: ScoreDimension; delta: number }[],
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const impact of impacts) {
      const w = this.weights[impact.dimension] ?? 1.0;
      weightedSum += impact.delta * w;
      totalWeight += w;
    }

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
  }

  private detectAccelerations(
    before: ApproachingPattern[],
    after: ApproachingPattern[],
  ): PatternAcceleration[] {
    const accelerations: PatternAcceleration[] = [];

    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after[i];
      if (!a) continue;

      const accelSprints = b.sprintsUntilThreshold - a.sprintsUntilThreshold;
      if (accelSprints > 0) {
        accelerations.push({
          pattern: b.type,
          module: b.module,
          sprintsBefore: b.sprintsUntilThreshold,
          sprintsAfter: a.sprintsUntilThreshold,
          acceleration: accelSprints,
          description: `'${b.type}' in ${b.module}: ${b.sprintsUntilThreshold} → ${a.sprintsUntilThreshold.toFixed(1)} sprints until threshold`,
        });
      }
    }

    return accelerations.sort((a, b) => b.acceleration - a.acceleration);
  }

  private calculateRiskScore(
    impacts: { dimension: ScoreDimension; delta: number }[],
    accelerations: PatternAcceleration[],
  ): number {
    // Base: sum of negative weighted deltas
    let risk = 0;
    for (const impact of impacts) {
      if (impact.delta < 0) {
        const w = this.weights[impact.dimension] ?? 1.0;
        risk += Math.abs(impact.delta) * w * 3; // scale factor
      }
    }

    // Add acceleration risk
    for (const accel of accelerations) {
      risk += accel.acceleration * 10;
      if (accel.sprintsAfter <= 1) risk += 20; // imminent breach bonus
    }

    return Math.min(100, Math.round(risk));
  }

  private recommendForDimension(
    dimension: ScoreDimension,
    delta: number,
    pr: PRChangeSet,
  ): string {
    const abs = Math.abs(delta);
    switch (dimension) {
      case "complexity":
        return `Reduce complexity: extract ${abs > 5 ? "multiple methods" : "a helper"} from large changes`;
      case "coupling":
        return `Reduce coupling: ${pr.filesChanged.length} files changed — consider splitting into smaller PRs`;
      case "cohesion":
        return "Improve cohesion: ensure changes are focused on a single responsibility";
      case "testCoverage":
        return `Add tests: ${pr.filesChanged.filter(f => !f.path.includes("test")).length} source files changed without corresponding tests`;
      case "security":
        return "Security review needed: sensitive files modified without security tests";
      case "documentation":
        return "Update documentation to reflect the changes in this PR";
      default:
        return `Address ${dimension} degradation (${abs} pts)`;
    }
  }
}
