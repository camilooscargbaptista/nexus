/**
 * Architecture Evolution Proposals (AEPs)
 *
 * Quarterly report generator combining:
 *   - Forecast engine (trajectory + pre-anti-patterns)
 *   - Drift detection (ADR compliance)
 *   - Business gates (business impact)
 *   - Risk budget (accumulated risk trends)
 *
 * Output: structured proposals with simulated impact scores,
 * effort estimates, and prioritized roadmap.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface AEPConfig {
  /** Reporting period label (e.g., "Q1 2026") */
  period: string;
  /** Organization / project name */
  projectName: string;
  /** Maximum proposals to generate (default: 10) */
  maxProposals?: number;
  /** Minimum confidence to include a proposal (default: 0.5) */
  minConfidence?: number;
}

export interface AEPInput {
  /** Current architecture scores */
  currentScores: ScoreSummary;
  /** Previous period scores for comparison */
  previousScores?: ScoreSummary;
  /** Active pre-anti-patterns approaching threshold */
  preAntiPatterns: PreAntiPatternInput[];
  /** Drift detection results */
  driftViolations: DriftInput[];
  /** Business gate evaluation */
  businessGateFailures: BusinessGateInput[];
  /** Risk budget trend from last N sprints */
  riskTrends: RiskTrendInput[];
  /** Module-level health data */
  moduleHealth: ModuleHealthInput[];
}

export interface ScoreSummary {
  overall: number;
  security: number;
  testing: number;
  performance: number;
  maintainability: number;
  architecture: number;
}

export interface PreAntiPatternInput {
  type: string;
  module: string;
  severity: number;
  sprintsUntilThreshold: number;
  trend: "accelerating" | "stable" | "decelerating";
}

export interface DriftInput {
  adrId: string;
  constraintType: string;
  description: string;
  severity: string;
}

export interface BusinessGateInput {
  dimension: string;
  score: number;
  threshold: number;
  gap: number;
  businessMetric: string;
}

export interface RiskTrendInput {
  sprintId: string;
  consumed: number;
  budget: number;
  utilizationPercent: number;
}

export interface ModuleHealthInput {
  module: string;
  score: number;
  churnRate: number;
  busFactor: number;
  couplingScore: number;
  trend: "improving" | "stable" | "degrading";
}

// ─── Output Types ───────────────────────────────────────────

export interface AEPReport {
  period: string;
  projectName: string;
  generatedAt: string;
  executiveSummary: string;
  healthOverview: HealthOverview;
  proposals: EvolutionProposal[];
  prioritizedRoadmap: RoadmapItem[];
  risks: RiskAssessment[];
  metrics: ReportMetrics;
}

export interface HealthOverview {
  overallScore: number;
  scoreTrend: "improving" | "stable" | "degrading";
  scoreDelta: number;
  topStrengths: string[];
  topConcerns: string[];
  driftScore: number;
  riskBudgetUtilization: number;
}

export interface EvolutionProposal {
  id: string;
  title: string;
  category: "refactoring" | "migration" | "decomposition" | "consolidation" | "security" | "testing" | "infra";
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  rationale: string;
  affectedModules: string[];
  estimatedEffort: EffortEstimate;
  simulatedImpact: SimulatedImpact;
  confidence: number;
  dependencies: string[];
  risks: string[];
}

export interface EffortEstimate {
  engineeringDays: number;
  size: "XS" | "S" | "M" | "L" | "XL";
  teamSize: number;
}

export interface SimulatedImpact {
  overallScoreDelta: number;
  dimensionDeltas: { dimension: string; delta: number }[];
  businessImpact: string;
  antiPatternsPrevented: string[];
  driftResolved: string[];
}

export interface RoadmapItem {
  quarter: string;
  proposalIds: string[];
  focus: string;
  expectedOutcome: string;
}

export interface RiskAssessment {
  risk: string;
  probability: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

export interface ReportMetrics {
  modulesAnalyzed: number;
  antiPatternsDetected: number;
  driftViolations: number;
  businessGateFailures: number;
  avgRiskBudgetUtilization: number;
}

// ═══════════════════════════════════════════════════════════════
// AEP GENERATOR
// ═══════════════════════════════════════════════════════════════

export class AEPGenerator {
  private config: Required<AEPConfig>;

  constructor(config: AEPConfig) {
    this.config = {
      maxProposals: config.maxProposals ?? 10,
      minConfidence: config.minConfidence ?? 0.5,
      period: config.period,
      projectName: config.projectName,
    };
  }

  /**
   * Generate a full Architecture Evolution Proposals report.
   */
  generate(input: AEPInput): AEPReport {
    const healthOverview = this.buildHealthOverview(input);
    const proposals = this.generateProposals(input);
    const roadmap = this.buildRoadmap(proposals);
    const risks = this.assessRisks(input);
    const summary = this.generateExecutiveSummary(healthOverview, proposals);

    return {
      period: this.config.period,
      projectName: this.config.projectName,
      generatedAt: new Date().toISOString(),
      executiveSummary: summary,
      healthOverview,
      proposals,
      prioritizedRoadmap: roadmap,
      risks,
      metrics: {
        modulesAnalyzed: input.moduleHealth.length,
        antiPatternsDetected: input.preAntiPatterns.length,
        driftViolations: input.driftViolations.length,
        businessGateFailures: input.businessGateFailures.length,
        avgRiskBudgetUtilization: this.avgUtilization(input.riskTrends),
      },
    };
  }

  // ─── Health Overview ────────────────────────────────────────

  private buildHealthOverview(input: AEPInput): HealthOverview {
    const delta = input.previousScores
      ? input.currentScores.overall - input.previousScores.overall
      : 0;

    const trend: HealthOverview["scoreTrend"] =
      delta > 2 ? "improving" : delta < -2 ? "degrading" : "stable";

    const dimensions: (keyof ScoreSummary)[] = ["security", "testing", "performance", "maintainability", "architecture"];
    const sorted = dimensions.sort((a, b) => input.currentScores[b] - input.currentScores[a]);

    const driftCompliant = Math.max(0, 100 - input.driftViolations.length * 10);
    const avgUtil = this.avgUtilization(input.riskTrends);

    return {
      overallScore: input.currentScores.overall,
      scoreTrend: trend,
      scoreDelta: delta,
      topStrengths: sorted.slice(0, 2).map(d => `${d}: ${input.currentScores[d]}`),
      topConcerns: sorted.slice(-2).map(d => `${d}: ${input.currentScores[d]}`),
      driftScore: driftCompliant,
      riskBudgetUtilization: avgUtil,
    };
  }

  // ─── Proposal Generation ───────────────────────────────────

  private generateProposals(input: AEPInput): EvolutionProposal[] {
    const proposals: EvolutionProposal[] = [];
    let idCounter = 1;

    // From pre-anti-patterns (imminent threats)
    for (const pattern of input.preAntiPatterns.filter(p => p.sprintsUntilThreshold <= 3)) {
      const confidence = pattern.trend === "accelerating" ? 0.9
        : pattern.trend === "stable" ? 0.7 : 0.5;

      if (confidence < this.config.minConfidence) continue;

      proposals.push({
        id: `AEP-${String(idCounter++).padStart(3, "0")}`,
        title: `Prevent ${this.formatPatternType(pattern.type)} in ${pattern.module}`,
        category: this.patternToCategory(pattern.type),
        priority: pattern.sprintsUntilThreshold <= 1 ? "critical" : "high",
        description: `${pattern.type} is ${pattern.sprintsUntilThreshold.toFixed(1)} sprints from threshold in module ${pattern.module}`,
        rationale: `Trend: ${pattern.trend}. Current severity: ${pattern.severity}/100. If unaddressed, will become a full anti-pattern, increasing maintenance cost significantly.`,
        affectedModules: [pattern.module],
        estimatedEffort: this.estimateEffort(pattern.severity),
        simulatedImpact: {
          overallScoreDelta: Math.min(10, Math.ceil(pattern.severity / 10)),
          dimensionDeltas: [{ dimension: "maintainability", delta: Math.ceil(pattern.severity / 8) }],
          businessImpact: `Prevents ${pattern.type}, reducing incident probability`,
          antiPatternsPrevented: [pattern.type],
          driftResolved: [],
        },
        confidence,
        dependencies: [],
        risks: [`Refactoring ${pattern.module} may introduce regressions`],
      });
    }

    // From drift violations (architectural compliance)
    const criticalDrifts = input.driftViolations.filter(d => d.severity === "critical" || d.severity === "high");
    if (criticalDrifts.length > 0) {
      proposals.push({
        id: `AEP-${String(idCounter++).padStart(3, "0")}`,
        title: "Resolve critical architectural drift",
        category: "refactoring",
        priority: "high",
        description: `${criticalDrifts.length} ADR constraint(s) violated: ${criticalDrifts.map(d => d.adrId).join(", ")}`,
        rationale: "Architectural drift left unchecked leads to inconsistency, confusion, and eventually a system that no longer matches its documented design.",
        affectedModules: [],
        estimatedEffort: this.estimateEffort(criticalDrifts.length * 20),
        simulatedImpact: {
          overallScoreDelta: criticalDrifts.length * 3,
          dimensionDeltas: [{ dimension: "architecture", delta: criticalDrifts.length * 5 }],
          businessImpact: "Reduces onboarding time and architecture confusion",
          antiPatternsPrevented: [],
          driftResolved: criticalDrifts.map(d => d.adrId),
        },
        confidence: 0.85,
        dependencies: [],
        risks: ["Some ADRs may need updating rather than code changes"],
      });
    }

    // From business gate failures
    for (const gate of input.businessGateFailures.filter(g => g.gap >= 10)) {
      proposals.push({
        id: `AEP-${String(idCounter++).padStart(3, "0")}`,
        title: `Close ${gate.dimension} gap (${gate.gap} pts below threshold)`,
        category: gate.dimension === "security" ? "security" : gate.dimension === "testing" ? "testing" : "refactoring",
        priority: gate.gap >= 25 ? "critical" : "high",
        description: `${gate.dimension} score ${gate.score} is ${gate.gap} pts below business threshold ${gate.threshold}. Business metric at risk: ${gate.businessMetric}`,
        rationale: `Business impact: ${gate.businessMetric} is directly correlated with ${gate.dimension} score.`,
        affectedModules: [],
        estimatedEffort: this.estimateEffort(gate.gap * 3),
        simulatedImpact: {
          overallScoreDelta: Math.ceil(gate.gap / 3),
          dimensionDeltas: [{ dimension: gate.dimension, delta: gate.gap }],
          businessImpact: `Improves ${gate.businessMetric}`,
          antiPatternsPrevented: [],
          driftResolved: [],
        },
        confidence: 0.8,
        dependencies: [],
        risks: [`Achieving ${gate.gap} pt improvement requires sustained effort`],
      });
    }

    // From degrading modules
    const degradingModules = input.moduleHealth
      .filter(m => m.trend === "degrading" && m.score < 60)
      .sort((a, b) => a.score - b.score);

    for (const mod of degradingModules.slice(0, 3)) {
      proposals.push({
        id: `AEP-${String(idCounter++).padStart(3, "0")}`,
        title: `Stabilize degrading module: ${mod.module}`,
        category: mod.busFactor <= 1 ? "consolidation" : "refactoring",
        priority: mod.score < 40 ? "high" : "medium",
        description: `Module ${mod.module} is degrading (score: ${mod.score}, churn: ${mod.churnRate.toFixed(2)}, bus factor: ${mod.busFactor})`,
        rationale: mod.busFactor <= 1
          ? `Bus factor of ${mod.busFactor} creates single-point-of-failure risk. Knowledge sharing is critical.`
          : `High churn rate (${mod.churnRate.toFixed(2)}) combined with degrading quality indicates accumulating debt.`,
        affectedModules: [mod.module],
        estimatedEffort: this.estimateEffort(100 - mod.score),
        simulatedImpact: {
          overallScoreDelta: Math.ceil((70 - mod.score) / 5),
          dimensionDeltas: [{ dimension: "maintainability", delta: Math.ceil((70 - mod.score) / 3) }],
          businessImpact: "Reduces maintenance cost and incident risk",
          antiPatternsPrevented: [],
          driftResolved: [],
        },
        confidence: 0.7,
        dependencies: [],
        risks: ["Module owner knowledge may be needed for safe refactoring"],
      });
    }

    // Sort by priority, then confidence
    const priorityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return proposals
      .sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0) || b.confidence - a.confidence)
      .slice(0, this.config.maxProposals);
  }

  // ─── Roadmap ───────────────────────────────────────────────

  private buildRoadmap(proposals: EvolutionProposal[]): RoadmapItem[] {
    const critical = proposals.filter(p => p.priority === "critical");
    const high = proposals.filter(p => p.priority === "high");
    const medium = proposals.filter(p => p.priority === "medium" || p.priority === "low");

    const items: RoadmapItem[] = [];

    if (critical.length > 0) {
      items.push({
        quarter: "Immediate (this sprint)",
        proposalIds: critical.map(p => p.id),
        focus: "Critical remediation",
        expectedOutcome: `Resolve ${critical.length} critical issue(s) before they become incidents`,
      });
    }

    if (high.length > 0) {
      items.push({
        quarter: "Next quarter",
        proposalIds: high.map(p => p.id),
        focus: "Technical debt reduction",
        expectedOutcome: `Address ${high.length} high-priority improvement(s) to stabilize architecture`,
      });
    }

    if (medium.length > 0) {
      items.push({
        quarter: "Following quarter",
        proposalIds: medium.map(p => p.id),
        focus: "Continuous improvement",
        expectedOutcome: `Implement ${medium.length} improvement(s) for long-term health`,
      });
    }

    return items;
  }

  // ─── Risk Assessment ───────────────────────────────────────

  private assessRisks(input: AEPInput): RiskAssessment[] {
    const risks: RiskAssessment[] = [];

    if (input.preAntiPatterns.some(p => p.sprintsUntilThreshold <= 1)) {
      risks.push({
        risk: "Imminent anti-pattern breach — architecture degradation within 1 sprint",
        probability: "high",
        impact: "high",
        mitigation: "Prioritize critical AEPs immediately; defer feature work if needed",
      });
    }

    const avgUtil = this.avgUtilization(input.riskTrends);
    if (avgUtil > 80) {
      risks.push({
        risk: "Risk budget consistently overutilized — deploys carry high risk",
        probability: "high",
        impact: "medium",
        mitigation: "Increase sprint budget or reduce deploy frequency; mandate smaller PRs",
      });
    }

    const degradingCount = input.moduleHealth.filter(m => m.trend === "degrading").length;
    if (degradingCount > input.moduleHealth.length * 0.3) {
      risks.push({
        risk: `${degradingCount}/${input.moduleHealth.length} modules degrading — systemic quality decline`,
        probability: "medium",
        impact: "high",
        mitigation: "Allocate 20% of sprint capacity to debt reduction across all modules",
      });
    }

    if (input.driftViolations.length > 5) {
      risks.push({
        risk: "Significant architectural drift — documented architecture diverges from reality",
        probability: "high",
        impact: "medium",
        mitigation: "Schedule architecture review session; update or enforce ADRs",
      });
    }

    const lowBusFactor = input.moduleHealth.filter(m => m.busFactor <= 1);
    if (lowBusFactor.length > 0) {
      risks.push({
        risk: `${lowBusFactor.length} module(s) with bus factor ≤ 1 — knowledge concentration risk`,
        probability: "medium",
        impact: "high",
        mitigation: "Pair programming, documentation sprints, and cross-training",
      });
    }

    return risks;
  }

  // ─── Executive Summary ─────────────────────────────────────

  private generateExecutiveSummary(
    health: HealthOverview,
    proposals: EvolutionProposal[],
  ): string {
    const trendStr = health.scoreTrend === "improving"
      ? `improving (+${health.scoreDelta} pts)`
      : health.scoreTrend === "degrading"
        ? `degrading (${health.scoreDelta} pts)`
        : "stable";

    const critical = proposals.filter(p => p.priority === "critical").length;
    const high = proposals.filter(p => p.priority === "high").length;

    const parts = [
      `Architecture health score: ${health.overallScore}/100 (${trendStr}).`,
    ];

    if (critical > 0) {
      parts.push(`${critical} critical proposal(s) require immediate attention.`);
    }
    if (high > 0) {
      parts.push(`${high} high-priority improvement(s) recommended for next quarter.`);
    }

    if (health.driftScore < 80) {
      parts.push(`Drift compliance at ${health.driftScore}% — ADR enforcement needed.`);
    }

    if (health.riskBudgetUtilization > 80) {
      parts.push(`Risk budget utilization averaging ${health.riskBudgetUtilization}% — near capacity.`);
    }

    const totalImpact = proposals.reduce((sum, p) => sum + p.simulatedImpact.overallScoreDelta, 0);
    parts.push(`Implementing all proposals could improve overall score by ~${totalImpact} pts.`);

    return parts.join(" ");
  }

  // ─── Helpers ───────────────────────────────────────────────

  private avgUtilization(trends: RiskTrendInput[]): number {
    if (trends.length === 0) return 0;
    return Math.round(trends.reduce((sum, t) => sum + t.utilizationPercent, 0) / trends.length);
  }

  private estimateEffort(severity: number): EffortEstimate {
    if (severity >= 80) return { engineeringDays: 15, size: "XL", teamSize: 3 };
    if (severity >= 60) return { engineeringDays: 10, size: "L", teamSize: 2 };
    if (severity >= 40) return { engineeringDays: 5, size: "M", teamSize: 2 };
    if (severity >= 20) return { engineeringDays: 3, size: "S", teamSize: 1 };
    return { engineeringDays: 1, size: "XS", teamSize: 1 };
  }

  private formatPatternType(type: string): string {
    return type
      .replace(/-/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  private patternToCategory(type: string): EvolutionProposal["category"] {
    if (type.includes("god") || type.includes("complex")) return "decomposition";
    if (type.includes("coupling") || type.includes("shotgun")) return "refactoring";
    if (type.includes("secur") || type.includes("vuln")) return "security";
    if (type.includes("test") || type.includes("cover")) return "testing";
    return "refactoring";
  }
}
