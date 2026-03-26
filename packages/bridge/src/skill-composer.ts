/**
 * Skill Composer — Dynamic pipeline chaining for CTO Toolkit skills
 *
 * Chains skills where the output of one feeds the input of the next.
 * Example: "security-review → pentest → remediation" runs in sequence,
 * each skill receiving enriched context from the previous step.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type {
  ArchitectureSnapshot,
  GuidanceResult,
  GuidanceFinding,
  Recommendation,
  NexusEventType,
  NexusLayer,
} from "@nexus/types";
import type { NexusEventBus } from "@nexus/events";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SkillStep {
  skillName: string;
  /** Optional filter: only pass findings matching these severities */
  filterSeverity?: string[];
  /** Optional: override confidence threshold for this step */
  minConfidence?: string;
}

export interface CompositionPipeline {
  name: string;
  description: string;
  steps: SkillStep[];
  /** If true, stop pipeline on first step that finds critical issues */
  haltOnCritical?: boolean;
}

export interface CompositionResult {
  pipeline: string;
  steps: StepResult[];
  totalFindings: number;
  totalRecommendations: number;
  combinedFindings: GuidanceFinding[];
  combinedRecommendations: Recommendation[];
  duration: number;
}

export interface StepResult {
  step: number;
  skillName: string;
  guidance: GuidanceResult;
  inputFindingsCount: number;
  outputFindingsCount: number;
  duration: number;
}

/** Pluggable skill executor — decouples composer from ToolkitRouter */
export interface SkillExecutor {
  execute(
    skillName: string,
    snapshot: ArchitectureSnapshot,
    previousFindings?: GuidanceFinding[],
  ): Promise<GuidanceResult>;
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN PIPELINES
// ═══════════════════════════════════════════════════════════════

export const BUILT_IN_PIPELINES: CompositionPipeline[] = [
  {
    name: "security-deep-dive",
    description: "Security review → penetration testing → compliance check",
    steps: [
      { skillName: "security-review" },
      { skillName: "pentest", filterSeverity: ["critical", "high"] },
      { skillName: "compliance-review" },
    ],
    haltOnCritical: false,
  },
  {
    name: "architecture-healing",
    description: "Design patterns → ADR → domain modeling for architecture issues",
    steps: [
      { skillName: "design-patterns" },
      { skillName: "adr" },
      { skillName: "domain-modeling" },
    ],
  },
  {
    name: "performance-pipeline",
    description: "Database review → performance profiling → observability",
    steps: [
      { skillName: "database-review" },
      { skillName: "performance-profiling" },
      { skillName: "observability" },
    ],
  },
  {
    name: "full-review",
    description: "Backend review → security → testing strategy → architecture",
    steps: [
      { skillName: "backend-review" },
      { skillName: "security-review" },
      { skillName: "testing-strategy" },
      { skillName: "design-patterns" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// COMPOSER
// ═══════════════════════════════════════════════════════════════

export class SkillComposer {
  constructor(
    private executor: SkillExecutor,
    private eventBus?: NexusEventBus,
  ) {}

  /**
   * Execute a composition pipeline — skills run in sequence,
   * each receiving the accumulated findings from previous steps.
   */
  async compose(
    pipeline: CompositionPipeline,
    snapshot: ArchitectureSnapshot,
  ): Promise<CompositionResult> {
    const start = Date.now();
    const stepResults: StepResult[] = [];
    let accumulatedFindings: GuidanceFinding[] = [];
    let accumulatedRecommendations: Recommendation[] = [];

    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      const stepStart = Date.now();

      // Filter findings for this step if configured
      let inputFindings = accumulatedFindings;
      if (step.filterSeverity && step.filterSeverity.length > 0) {
        inputFindings = accumulatedFindings.filter(f =>
          step.filterSeverity!.includes(f.severity)
        );
      }

      // Execute the skill with enriched context
      const guidance = await this.executor.execute(
        step.skillName,
        snapshot,
        inputFindings.length > 0 ? inputFindings : undefined,
      );

      const stepResult: StepResult = {
        step: i + 1,
        skillName: step.skillName,
        guidance,
        inputFindingsCount: inputFindings.length,
        outputFindingsCount: guidance.findings.length,
        duration: Date.now() - stepStart,
      };
      stepResults.push(stepResult);

      // Accumulate findings and recommendations (deduplicate by id)
      const existingIds = new Set(accumulatedFindings.map(f => f.id));
      for (const finding of guidance.findings) {
        if (!existingIds.has(finding.id)) {
          accumulatedFindings.push(finding);
          existingIds.add(finding.id);
        }
      }

      const existingRecIds = new Set(accumulatedRecommendations.map(r => r.id));
      for (const rec of guidance.recommendations) {
        if (!existingRecIds.has(rec.id)) {
          accumulatedRecommendations.push(rec);
          existingRecIds.add(rec.id);
        }
      }

      // Halt on critical if configured
      if (pipeline.haltOnCritical) {
        const hasCritical = guidance.findings.some(f => f.severity === "critical");
        if (hasCritical) break;
      }
    }

    const result: CompositionResult = {
      pipeline: pipeline.name,
      steps: stepResults,
      totalFindings: accumulatedFindings.length,
      totalRecommendations: accumulatedRecommendations.length,
      combinedFindings: accumulatedFindings,
      combinedRecommendations: accumulatedRecommendations,
      duration: Date.now() - start,
    };

    // Emit composition event
    if (this.eventBus) {
      await this.eventBus.publish(
        "guidance.generated" as NexusEventType,
        "reasoning" as NexusLayer,
        {
          type: "composition",
          pipeline: pipeline.name,
          stepsExecuted: stepResults.length,
          totalFindings: accumulatedFindings.length,
          totalRecommendations: accumulatedRecommendations.length,
        },
        { projectPath: snapshot.projectPath, projectName: snapshot.projectName },
      );
    }

    return result;
  }

  /** List available built-in pipelines */
  listPipelines(): CompositionPipeline[] {
    return [...BUILT_IN_PIPELINES];
  }

  /** Auto-select the best pipeline for a snapshot */
  suggestPipeline(snapshot: ArchitectureSnapshot): CompositionPipeline | null {
    const hasSecurityIssues = snapshot.antiPatterns.some(ap =>
      ["hardcoded_secret", "sql_injection", "xss", "insecure_auth"].some(
        p => ap.pattern.toLowerCase().includes(p)
      )
    );
    if (hasSecurityIssues) return BUILT_IN_PIPELINES[0]; // security-deep-dive

    const hasArchIssues = snapshot.antiPatterns.some(ap =>
      ["god_class", "circular_dependency", "feature_envy"].some(
        p => ap.pattern.toLowerCase().includes(p)
      )
    );
    if (hasArchIssues) return BUILT_IN_PIPELINES[1]; // architecture-healing

    if (snapshot.score.overall < 60) return BUILT_IN_PIPELINES[3]; // full-review

    return null;
  }
}
