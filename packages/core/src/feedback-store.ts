/**
 * Feedback Loop Storage — Learn from pipeline runs
 *
 * Stores results of each pipeline run for trend analysis:
 *   - Runs with scores, findings, actions taken
 *   - Finding outcomes (accepted, dismissed, false-positive)
 *   - Fix outcomes (applied, reverted, effective)
 *   - Trend queries for analysis
 *
 * Uses an in-memory store by default with pluggable persistence.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PipelineRun {
  id: string;
  projectPath: string;
  timestamp: string;
  duration: number;
  scores: ScoreSnapshot;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  remediationsAttempted: number;
  remediationsSucceeded: number;
  metadata?: Record<string, unknown>;
}

export interface ScoreSnapshot {
  overall: number;
  [dimension: string]: number;
}

export interface FindingOutcome {
  findingId: string;
  runId: string;
  timestamp: string;
  severity: string;
  category: string;
  outcome: "accepted" | "dismissed" | "false-positive" | "deferred";
  userFeedback?: string;
}

export interface FixOutcome {
  fixId: string;
  findingId: string;
  runId: string;
  timestamp: string;
  applied: boolean;
  reverted: boolean;
  scoreBefore: number;
  scoreAfter: number;
  effective: boolean;
}

export interface TrendQuery {
  projectPath?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface TrendResult {
  runs: number;
  scoreHistory: { timestamp: string; overall: number }[];
  avgScore: number;
  scoreTrend: "improving" | "stable" | "degrading";
  topFalsePositives: { category: string; count: number }[];
  fixEffectiveness: number; // percentage of applied fixes that were effective
  mostDismissedCategories: { category: string; dismissRate: number }[];
}

/** Pluggable persistence backend */
export interface FeedbackPersistence {
  saveRun(run: PipelineRun): Promise<void>;
  saveFindingOutcome(outcome: FindingOutcome): Promise<void>;
  saveFixOutcome(outcome: FixOutcome): Promise<void>;
  getRuns(query: TrendQuery): Promise<PipelineRun[]>;
  getFindingOutcomes(runId?: string): Promise<FindingOutcome[]>;
  getFixOutcomes(runId?: string): Promise<FixOutcome[]>;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY PERSISTENCE
// ═══════════════════════════════════════════════════════════════

export class InMemoryPersistence implements FeedbackPersistence {
  private runs: PipelineRun[] = [];
  private findingOutcomes: FindingOutcome[] = [];
  private fixOutcomes: FixOutcome[] = [];

  async saveRun(run: PipelineRun): Promise<void> {
    this.runs.push(run);
  }

  async saveFindingOutcome(outcome: FindingOutcome): Promise<void> {
    this.findingOutcomes.push(outcome);
  }

  async saveFixOutcome(outcome: FixOutcome): Promise<void> {
    this.fixOutcomes.push(outcome);
  }

  async getRuns(query: TrendQuery): Promise<PipelineRun[]> {
    let results = [...this.runs];

    if (query.projectPath) {
      results = results.filter(r => r.projectPath === query.projectPath);
    }
    if (query.fromDate) {
      results = results.filter(r => r.timestamp >= query.fromDate!);
    }
    if (query.toDate) {
      results = results.filter(r => r.timestamp <= query.toDate!);
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getFindingOutcomes(runId?: string): Promise<FindingOutcome[]> {
    if (runId) return this.findingOutcomes.filter(o => o.runId === runId);
    return [...this.findingOutcomes];
  }

  async getFixOutcomes(runId?: string): Promise<FixOutcome[]> {
    if (runId) return this.fixOutcomes.filter(o => o.runId === runId);
    return [...this.fixOutcomes];
  }
}

// ═══════════════════════════════════════════════════════════════
// FEEDBACK STORE
// ═══════════════════════════════════════════════════════════════

export class FeedbackStore {
  constructor(private persistence: FeedbackPersistence = new InMemoryPersistence()) {}

  /**
   * Record a pipeline run.
   */
  async recordRun(run: PipelineRun): Promise<void> {
    await this.persistence.saveRun(run);
  }

  /**
   * Record the outcome of a finding (user accepted, dismissed, etc).
   */
  async recordFindingOutcome(outcome: FindingOutcome): Promise<void> {
    await this.persistence.saveFindingOutcome(outcome);
  }

  /**
   * Record the outcome of an auto-fix attempt.
   */
  async recordFixOutcome(outcome: FixOutcome): Promise<void> {
    await this.persistence.saveFixOutcome(outcome);
  }

  /**
   * Query score and quality trends over time.
   */
  async queryTrends(query: TrendQuery = {}): Promise<TrendResult> {
    const runs = await this.persistence.getRuns(query);
    const findingOutcomes = await this.persistence.getFindingOutcomes();
    const fixOutcomes = await this.persistence.getFixOutcomes();

    // Score history
    const scoreHistory = runs
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map(r => ({ timestamp: r.timestamp, overall: r.scores.overall }));

    // Average score
    const avgScore = runs.length > 0
      ? Math.round(runs.reduce((sum, r) => sum + r.scores.overall, 0) / runs.length)
      : 0;

    // Score trend (linear regression simplified: compare first half vs second half)
    const scoreTrend = this.classifyTrend(scoreHistory.map(s => s.overall));

    // False positives by category
    const fpByCategory = new Map<string, number>();
    for (const outcome of findingOutcomes.filter(o => o.outcome === "false-positive")) {
      fpByCategory.set(outcome.category, (fpByCategory.get(outcome.category) ?? 0) + 1);
    }
    const topFalsePositives = Array.from(fpByCategory.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Fix effectiveness
    const appliedFixes = fixOutcomes.filter(f => f.applied);
    const effectiveFixes = appliedFixes.filter(f => f.effective);
    const fixEffectiveness = appliedFixes.length > 0
      ? Math.round((effectiveFixes.length / appliedFixes.length) * 100)
      : 0;

    // Most dismissed categories
    const categoryTotal = new Map<string, { total: number; dismissed: number }>();
    for (const outcome of findingOutcomes) {
      const entry = categoryTotal.get(outcome.category) ?? { total: 0, dismissed: 0 };
      entry.total++;
      if (outcome.outcome === "dismissed") entry.dismissed++;
      categoryTotal.set(outcome.category, entry);
    }
    const mostDismissedCategories = Array.from(categoryTotal.entries())
      .filter(([_, v]) => v.total >= 3) // minimum sample
      .map(([category, v]) => ({
        category,
        dismissRate: Math.round((v.dismissed / v.total) * 100),
      }))
      .sort((a, b) => b.dismissRate - a.dismissRate)
      .slice(0, 5);

    return {
      runs: runs.length,
      scoreHistory,
      avgScore,
      scoreTrend,
      topFalsePositives,
      fixEffectiveness,
      mostDismissedCategories,
    };
  }

  /**
   * Get false positive rate for a specific finding category.
   * Useful for auto-adjusting confidence thresholds.
   */
  async getFalsePositiveRate(category: string): Promise<number> {
    const outcomes = await this.persistence.getFindingOutcomes();
    const categoryOutcomes = outcomes.filter(o => o.category === category);
    if (categoryOutcomes.length < 5) return 0; // insufficient data

    const fps = categoryOutcomes.filter(o => o.outcome === "false-positive").length;
    return Math.round((fps / categoryOutcomes.length) * 100);
  }

  /**
   * Get the most recently recorded run for a project.
   */
  async getLatestRun(projectPath: string): Promise<PipelineRun | undefined> {
    const runs = await this.persistence.getRuns({ projectPath, limit: 1 });
    return runs[0];
  }

  // ─── Private ────────────────────────────────────────────────

  private classifyTrend(scores: number[]): TrendResult["scoreTrend"] {
    if (scores.length < 3) return "stable";

    const mid = Math.floor(scores.length / 2);
    const firstHalf = scores.slice(0, mid);
    const secondHalf = scores.slice(mid);

    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

    const delta = avgSecond - avgFirst;
    if (delta > 2) return "improving";
    if (delta < -2) return "degrading";
    return "stable";
  }
}
