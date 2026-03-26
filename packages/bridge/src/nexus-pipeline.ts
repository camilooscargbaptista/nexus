/**
 * Nexus Pipeline — The unified orchestrator
 *
 * Chains the three layers in the closed loop:
 *   Perception (Architect) → Reasoning (CTO Toolkit) → Validation (Sentinel)
 *
 * This is the heart of the Nexus platform.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { randomUUID } from "node:crypto";
import type {
  NexusConfig,
  NexusPipelineResult,
  NexusInsight,
  ArchitectureSnapshot,
  GuidanceResult,
  ValidationSnapshot,
  NexusEventType,
  NexusLayer,
  Severity,
  ConfidenceLevel,
} from "@nexus/types";
import { DEFAULT_CONFIG } from "@nexus/types";
import { NexusEventBus } from "@nexus/events";
import { ArchitectAdapter } from "./architect-adapter.js";
import { SentinelAdapter } from "./sentinel-adapter.js";
import { ToolkitRouter } from "./toolkit-router.js";

// ═══════════════════════════════════════════════════════════════
// LOGGER INTERFACE (local — avoids coupling bridge → core)
// ═══════════════════════════════════════════════════════════════

export interface PipelineLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class DefaultPipelineLogger implements PipelineLogger {
  info(message: string, ...args: unknown[]): void { this.logger.info(message, ...args); }
  warn(message: string, ...args: unknown[]): void { console.warn(message, ...args); }
  error(message: string, ...args: unknown[]): void { console.error(message, ...args); }
  debug(message: string, ...args: unknown[]): void { console.debug(message, ...args); }
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE DEPENDENCIES — DI container
// ═══════════════════════════════════════════════════════════════

export interface NexusPipelineDeps {
  eventBus?: NexusEventBus;
  architectAdapter?: ArchitectAdapter;
  sentinelAdapter?: SentinelAdapter;
  toolkitRouter?: ToolkitRouter;
  logger?: PipelineLogger;
}

// ═══════════════════════════════════════════════════════════════
// NEXUS PIPELINE
// ═══════════════════════════════════════════════════════════════

export class NexusPipeline {
  private eventBus: NexusEventBus;
  private architectAdapter: ArchitectAdapter;
  private sentinelAdapter: SentinelAdapter;
  private toolkitRouter: ToolkitRouter;
  private config: NexusConfig;
  private logger: PipelineLogger;

  constructor(config?: Partial<NexusConfig>, deps?: NexusPipelineDeps) {
    this.config = { ...DEFAULT_CONFIG, ...config } as NexusConfig;
    this.logger = deps?.logger ?? new DefaultPipelineLogger();
    this.eventBus = deps?.eventBus ?? new NexusEventBus();
    this.architectAdapter = deps?.architectAdapter ?? new ArchitectAdapter(this.eventBus);
    this.sentinelAdapter = deps?.sentinelAdapter ?? new SentinelAdapter(this.eventBus);
    this.toolkitRouter = deps?.toolkitRouter ?? new ToolkitRouter(this.eventBus);
  }

  /**
   * Run the full Nexus pipeline on a project.
   *
   * Flow:
   *   1. Architect analyzes the codebase (Perception)
   *   2. Toolkit Router maps findings to skills (Reasoning)
   *   3. Sentinel validates the codebase (Validation)
   *   4. Cross-layer insights are generated
   *   5. Unified NexusPipelineResult is produced
   */
  async run(projectPath?: string): Promise<NexusPipelineResult> {
    const path = projectPath ?? this.config.projectPath;
    const pipelineId = randomUUID();
    const startTime = Date.now();

    // Emit pipeline start
    await this.eventBus.publish(
      "pipeline.started" as NexusEventType,
      "perception" as NexusLayer,
      { projectPath: path, config: this.config },
      { projectPath: path }
    );

    let perception: ArchitectureSnapshot | undefined;
    let reasoning: GuidanceResult[] = [];
    let validation: ValidationSnapshot | undefined;

    try {
      // ─── Layer I: Perception (Architect) ───
      if (this.config.perception.enabled) {
        this.logger.info("\n\u26A1 [Nexus] Layer I: Perception (Architect)...");
        perception = await this.architectAdapter.analyze(path);
        this.logger.info(`   Score: ${perception.score.overall}/100 | Anti-patterns: ${perception.antiPatterns.length} | Layers: ${perception.layers.length}`);
      }

      // ─── Layer II: Reasoning (CTO Toolkit Router) ───
      if (this.config.reasoning.enabled && perception) {
        this.logger.info("\n\uD83E\uDDE0 [Nexus] Layer II: Reasoning (CTO Toolkit)...");
        reasoning = await this.toolkitRouter.route(perception);
        const totalFindings = reasoning.reduce((s, r) => s + r.findings.length, 0);
        const totalRecs = reasoning.reduce((s, r) => s + r.recommendations.length, 0);
        this.logger.info(`   Skills activated: ${reasoning.length} | Findings: ${totalFindings} | Recommendations: ${totalRecs}`);
      }

      // ─── Layer III: Validation (Sentinel) ───
      if (this.config.validation.enabled) {
        this.logger.info("\n\uD83D\uDEE1\uFE0F  [Nexus] Layer III: Validation (Sentinel)...");
        validation = await this.sentinelAdapter.validate(path, {
          securityLevel: this.config.validation.securityLevel,
          testingThreshold: this.config.validation.testingThreshold,
          performanceTarget: this.config.validation.performanceTarget,
          maintainabilityScore: this.config.validation.maintainabilityScore,
        });
        this.logger.info(`   Score: ${validation.overallScore}/100 | Passed: ${validation.success} | Issues: ${validation.issueCount.total}`);
      }
    } catch (error) {
      await this.eventBus.publish(
        "error.occurred" as NexusEventType,
        "perception" as NexusLayer,
        { error: error instanceof Error ? error.message : String(error) },
        { projectPath: path }
      );
      throw error;
    }

    // ─── Generate cross-layer insights ───
    const insights = this.generateInsights(perception, reasoning, validation);
    const healthScore = this.calculateHealthScore(perception, validation);
    const trend = this.determineTrend(perception, validation);

    const duration = Date.now() - startTime;

    const result: NexusPipelineResult = {
      id: pipelineId,
      projectPath: path,
      projectName: perception?.projectName ?? path.split("/").pop() ?? "unknown",
      timestamp: new Date().toISOString(),
      duration,
      domain: perception?.domain ?? ("generic" as any),
      perception: perception!,
      reasoning,
      validation: validation!,
      insights,
      healthScore,
      trend,
    };

    // Emit pipeline completion
    await this.eventBus.publish(
      "pipeline.completed" as NexusEventType,
      "perception" as NexusLayer,
      {
        pipelineId,
        duration,
        healthScore,
        trend,
        skillsActivated: reasoning.length,
        issueCount: validation?.issueCount.total ?? 0,
      },
      { projectPath: path, duration }
    );

    this.logger.info(`\n\u2728 [Nexus] Pipeline complete in ${(duration / 1000).toFixed(1)}s`);
    this.logger.info(`   Health Score: ${healthScore}/100 | Trend: ${trend}`);
    this.logger.info(`   Insights: ${insights.length} | Skills: ${reasoning.length}`);

    return result;
  }

  /**
   * Generate cross-layer insights by correlating findings from all three layers.
   */
  private generateInsights(
    perception?: ArchitectureSnapshot,
    reasoning?: GuidanceResult[],
    validation?: ValidationSnapshot
  ): NexusInsight[] {
    const insights: NexusInsight[] = [];

    if (!perception || !validation) return insights;

    // Insight: Architecture score vs validation score divergence
    const scoreDiff = Math.abs(perception.score.overall - validation.overallScore);
    if (scoreDiff > 20) {
      insights.push({
        id: randomUUID(),
        type: "correlation",
        title: "Architecture-Validation Score Divergence",
        description: `Architecture score (${perception.score.overall}) and validation score (${validation.overallScore}) diverge by ${scoreDiff} points. This suggests ${perception.score.overall > validation.overallScore ? "good structure but poor implementation quality" : "solid implementation but architectural issues"}.`,
        sources: ["perception" as NexusLayer, "validation" as NexusLayer],
        severity: scoreDiff > 30 ? ("high" as Severity) : ("medium" as Severity),
        confidence: "high" as ConfidenceLevel,
        actionable: true,
      });
    }

    // Insight: Critical anti-patterns with security issues
    const criticalAPs = perception.antiPatterns.filter(
      (ap) => ap.severity === ("critical" as Severity) || ap.severity === ("high" as Severity)
    );
    const securityIssues = validation.validators.find((v) => v.name.toLowerCase().includes("security"));

    if (criticalAPs.length > 0 && securityIssues && !securityIssues.passed) {
      insights.push({
        id: randomUUID(),
        type: "warning",
        title: "Critical: Architecture Issues Compound Security Vulnerabilities",
        description: `${criticalAPs.length} critical architecture anti-patterns combined with ${securityIssues.issueCount} security issues create compounding risk. Anti-patterns like ${criticalAPs[0]?.pattern} make security vulnerabilities harder to isolate and fix.`,
        sources: ["perception" as NexusLayer, "validation" as NexusLayer],
        severity: "critical" as Severity,
        confidence: "high" as ConfidenceLevel,
        actionable: true,
      });
    }

    // Insight: Skill coverage analysis
    if (reasoning && reasoning.length > 0) {
      const coveredCategories = new Set(reasoning.map((r) => r.category));
      const totalFindings = reasoning.reduce((s, r) => s + r.findings.length, 0);

      insights.push({
        id: randomUUID(),
        type: "recommendation",
        title: "Guided Remediation Available",
        description: `${reasoning.length} CTO Toolkit skills across ${coveredCategories.size} categories have been activated with ${totalFindings} specific findings. Each finding includes actionable recommendations from the engineering knowledge base.`,
        sources: ["perception" as NexusLayer, "reasoning" as NexusLayer],
        severity: "info" as Severity,
        confidence: "high" as ConfidenceLevel,
        actionable: true,
      });
    }

    // Insight: Domain-specific risk assessment
    if (perception.domain !== ("generic" as any)) {
      const domainRiskMap: Record<string, string[]> = {
        fintech: ["security", "compliance", "testing"],
        healthtech: ["security", "compliance", "testing"],
        ecommerce: ["performance", "security"],
      };
      const riskAreas = domainRiskMap[perception.domain] ?? [];
      const failedRiskValidators = validation.validators
        .filter((v) => !v.passed && riskAreas.some((r) => v.name.toLowerCase().includes(r)));

      if (failedRiskValidators.length > 0) {
        insights.push({
          id: randomUUID(),
          type: "warning",
          title: `Domain Risk: ${perception.domain} Critical Validators Failing`,
          description: `In the ${perception.domain} domain, the following critical validators are failing: ${failedRiskValidators.map((v) => v.name).join(", ")}. These are high-priority for ${perception.domain} compliance and reliability.`,
          sources: ["perception" as NexusLayer, "validation" as NexusLayer],
          severity: "high" as Severity,
          confidence: "high" as ConfidenceLevel,
          actionable: true,
        });
      }
    }

    // Insight: Coupling + low test coverage = prediction
    if (perception.score.coupling < 50) {
      const testingValidator = validation.validators.find((v) =>
        v.name.toLowerCase().includes("test")
      );
      if (testingValidator && testingValidator.score < 60) {
        insights.push({
          id: randomUUID(),
          type: "prediction",
          title: "Prediction: Regression Risk is High",
          description: `High coupling (score: ${perception.score.coupling}/100) combined with low test coverage (score: ${testingValidator.score}/100) creates a high probability of regression bugs when making changes. Each change is likely to have unintended side effects in tightly coupled modules.`,
          sources: ["perception" as NexusLayer, "validation" as NexusLayer],
          severity: "high" as Severity,
          confidence: "medium" as ConfidenceLevel,
          actionable: true,
        });
      }
    }

    return insights;
  }

  /**
   * Calculate composite health score from all layers.
   */
  private calculateHealthScore(
    perception?: ArchitectureSnapshot,
    validation?: ValidationSnapshot
  ): number {
    const scores: number[] = [];
    if (perception) scores.push(perception.score.overall);
    if (validation) scores.push(validation.overallScore);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Determine project trend. In v1, we use score thresholds.
   * In v2, this will use historical snapshots.
   */
  private determineTrend(
    perception?: ArchitectureSnapshot,
    validation?: ValidationSnapshot
  ): "improving" | "stable" | "degrading" {
    const health = this.calculateHealthScore(perception, validation);
    if (health >= 75) return "stable";
    if (health >= 50) return "stable"; // Need history to determine trend
    return "degrading";
  }

  /**
   * Get the event bus for external subscriptions.
   */
  get events(): NexusEventBus {
    return this.eventBus;
  }
}
