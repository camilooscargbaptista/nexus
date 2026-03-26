/**
 * DarkFactory — Autonomous spec-to-deploy pipeline
 *
 * Inspired by claude-octopus factory.sh.
 * 7-phase autonomous pipeline: Parse → Score → Generate Scenarios →
 * Split Holdout → Implement → Holdout Test → Report.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type SpecMaturity = "skeleton" | "draft" | "standard" | "mature";

export type FactoryPhase =
  | "parse" | "score-spec" | "generate-scenarios"
  | "split-holdout" | "implement" | "holdout-test" | "report";

export type FactoryVerdict = "PASS" | "WARN" | "FAIL";

export interface FactoryConfig {
  holdoutRatio: number;          // 0.0-1.0, default 0.15
  maxRetries: number;            // default 2
  minSpecScore: number;          // min NQS (Natural Quality Score), default 85
  satisfactionTarget: number;    // 0.0-1.0, default 0.90
  timeoutPerPhaseMs: number;     // default 120000
}

export interface SpecAnalysis {
  title: string;
  maturity: SpecMaturity;
  sections: string[];
  sectionCount: number;
  qualityScore: number;          // 0-100 (NQS)
  missingCritical: string[];     // critical missing sections
  satisfactionTarget: number;
}

export interface TestScenario {
  id: string;
  description: string;
  type: "functional" | "edge-case" | "security" | "performance" | "integration";
  priority: "critical" | "high" | "medium" | "low";
  acceptanceCriteria: string;
}

export interface HoldoutSplit {
  visible: TestScenario[];       // scenarios used during implementation
  holdout: TestScenario[];       // blind scenarios for evaluation
  holdoutRatio: number;
}

export interface HoldoutResult {
  scenarioId: string;
  description: string;
  verdict: "PASS" | "PARTIAL" | "FAIL";
  score: number;                 // 1.0, 0.5, 0.0
  feedback: string;
}

export interface FactoryReport {
  specTitle: string;
  specMaturity: SpecMaturity;
  specQualityScore: number;
  totalScenarios: number;
  holdoutCount: number;
  visibleCount: number;
  holdoutResults: HoldoutResult[];
  satisfactionScore: number;     // 0.0-1.0
  satisfactionTarget: number;
  verdict: FactoryVerdict;
  retryCount: number;
  phases: PhaseResult[];
  totalDurationMs: number;
  recommendations: string[];
}

export interface PhaseResult {
  phase: FactoryPhase;
  status: "completed" | "failed" | "skipped";
  durationMs: number;
  output?: string;
  error?: string;
}

/** External dependency: executes implementation given scenarios */
export interface ImplementationEngine {
  implement(spec: string, scenarios: TestScenario[]): Promise<string>;
}

/** External dependency: evaluates implementation against scenarios */
export interface EvaluationEngine {
  evaluate(implementation: string, scenario: TestScenario): Promise<HoldoutResult>;
}

// ═══════════════════════════════════════════════════════════════
// SPEC ANALYSIS
// ═══════════════════════════════════════════════════════════════

const SPEC_SECTIONS = {
  critical: ["overview", "requirements", "acceptance criteria", "constraints"],
  important: ["architecture", "api", "data model", "security"],
  nice: ["examples", "milestones", "glossary", "dependencies"],
};

export function assessSpecMaturity(specContent: string): SpecAnalysis {
  const lower = specContent.toLowerCase();
  const lines = specContent.split("\n");

  // Extract title from first heading
  const titleLine = lines.find(l => l.startsWith("#"));
  const title = titleLine?.replace(/^#+\s*/, "").trim() || "Untitled Spec";

  // Count sections (headings)
  const headings = lines.filter(l => /^#{1,3}\s/.test(l)).map(l => l.replace(/^#+\s*/, "").trim());
  const sectionCount = headings.length;

  // Check for critical sections
  const foundSections: string[] = [];
  const missingCritical: string[] = [];

  for (const section of SPEC_SECTIONS.critical) {
    if (lower.includes(section)) {
      foundSections.push(section);
    } else {
      missingCritical.push(section);
    }
  }

  for (const section of SPEC_SECTIONS.important) {
    if (lower.includes(section)) foundSections.push(section);
  }

  for (const section of SPEC_SECTIONS.nice) {
    if (lower.includes(section)) foundSections.push(section);
  }

  // Calculate NQS (Natural Quality Score)
  const criticalScore = (SPEC_SECTIONS.critical.length - missingCritical.length) / SPEC_SECTIONS.critical.length;
  const importantScore = SPEC_SECTIONS.important.filter(s => lower.includes(s)).length / SPEC_SECTIONS.important.length;
  const niceScore = SPEC_SECTIONS.nice.filter(s => lower.includes(s)).length / SPEC_SECTIONS.nice.length;

  const qualityScore = Math.round((criticalScore * 60 + importantScore * 25 + niceScore * 15));

  // Determine maturity
  let maturity: SpecMaturity;
  if (sectionCount < 3) maturity = "skeleton";
  else if (sectionCount < 5) maturity = "draft";
  else if (sectionCount < 7) maturity = "standard";
  else maturity = "mature";

  // Extract satisfaction target (look for "target: X%" or "satisfaction: X%")
  const targetMatch = specContent.match(/(?:target|satisfaction|threshold)\s*[:=]\s*(\d+)%?/i);
  const satisfactionTarget = targetMatch ? parseInt(targetMatch[1]) / 100 : 0.90;

  return {
    title,
    maturity,
    sections: foundSections,
    sectionCount,
    qualityScore,
    missingCritical,
    satisfactionTarget,
  };
}

// ═══════════════════════════════════════════════════════════════
// HOLDOUT SPLITTING (from Octopus's deterministic diversity split)
// ═══════════════════════════════════════════════════════════════

export function splitHoldout(scenarios: TestScenario[], ratio: number = 0.15): HoldoutSplit {
  if (scenarios.length < 3) {
    return { visible: scenarios, holdout: [], holdoutRatio: 0 };
  }

  const holdoutCount = Math.max(1, Math.round(scenarios.length * ratio));
  const step = scenarios.length / holdoutCount;

  // Deterministic spread for type diversity (from Octopus)
  const holdoutIndices = new Set<number>();
  for (let i = 0; i < holdoutCount; i++) {
    const idx = Math.floor((i * step + step / 2) % scenarios.length);
    holdoutIndices.add(idx);
  }

  // Ensure critical scenarios are never in holdout
  const criticalIndices = new Set(
    scenarios
      .map((s, i) => s.priority === "critical" ? i : -1)
      .filter(i => i >= 0),
  );

  const holdout: TestScenario[] = [];
  const visible: TestScenario[] = [];

  scenarios.forEach((s, i) => {
    if (holdoutIndices.has(i) && !criticalIndices.has(i) && holdout.length < holdoutCount) {
      holdout.push(s);
    } else {
      visible.push(s);
    }
  });

  return {
    visible,
    holdout,
    holdoutRatio: holdout.length / scenarios.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// DARK FACTORY ENGINE
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: FactoryConfig = {
  holdoutRatio: 0.15,
  maxRetries: 2,
  minSpecScore: 85,
  satisfactionTarget: 0.90,
  timeoutPerPhaseMs: 120_000,
};

export class DarkFactory {
  private config: FactoryConfig;

  constructor(
    private readonly implementer: ImplementationEngine,
    private readonly evaluator: EvaluationEngine,
    config?: Partial<FactoryConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Run the full 7-phase autonomous pipeline */
  async run(specContent: string, scenarios?: TestScenario[]): Promise<FactoryReport> {
    const phases: PhaseResult[] = [];
    const start = Date.now();
    let retryCount = 0;

    // Phase 1: Parse spec
    const parseStart = Date.now();
    const specAnalysis = assessSpecMaturity(specContent);
    phases.push({
      phase: "parse",
      status: "completed",
      durationMs: Date.now() - parseStart,
      output: `Title: ${specAnalysis.title}, Maturity: ${specAnalysis.maturity}`,
    });

    // Phase 2: Score spec quality
    const scoreStart = Date.now();
    if (specAnalysis.qualityScore < this.config.minSpecScore) {
      phases.push({
        phase: "score-spec",
        status: "failed",
        durationMs: Date.now() - scoreStart,
        error: `Spec quality ${specAnalysis.qualityScore}/100 below minimum ${this.config.minSpecScore}. Missing: ${specAnalysis.missingCritical.join(", ")}`,
      });

      return this.buildReport(specAnalysis, [], { visible: [], holdout: [], holdoutRatio: 0 }, [], phases, 0, start);
    }
    phases.push({
      phase: "score-spec",
      status: "completed",
      durationMs: Date.now() - scoreStart,
      output: `NQS: ${specAnalysis.qualityScore}/100`,
    });

    // Phase 3: Generate or use provided scenarios
    const genStart = Date.now();
    const testScenarios = scenarios ?? this.generateDefaultScenarios(specAnalysis);
    phases.push({
      phase: "generate-scenarios",
      status: "completed",
      durationMs: Date.now() - genStart,
      output: `${testScenarios.length} scenarios generated`,
    });

    // Phase 4: Split holdout
    const splitStart = Date.now();
    const split = splitHoldout(testScenarios, this.config.holdoutRatio);
    phases.push({
      phase: "split-holdout",
      status: "completed",
      durationMs: Date.now() - splitStart,
      output: `Visible: ${split.visible.length}, Holdout: ${split.holdout.length}`,
    });

    // Phase 5: Implement (using visible scenarios only)
    const implStart = Date.now();
    let implementation: string;
    try {
      implementation = await this.implementer.implement(specContent, split.visible);
      phases.push({
        phase: "implement",
        status: "completed",
        durationMs: Date.now() - implStart,
      });
    } catch (err: any) {
      phases.push({
        phase: "implement",
        status: "failed",
        durationMs: Date.now() - implStart,
        error: err.message,
      });
      return this.buildReport(specAnalysis, testScenarios, split, [], phases, 0, start);
    }

    // Phase 6: Holdout test (blind evaluation)
    let holdoutResults = await this.runHoldoutTests(implementation, split.holdout);
    let satisfaction = this.calculateSatisfaction(holdoutResults);

    phases.push({
      phase: "holdout-test",
      status: "completed",
      durationMs: Date.now() - implStart,
      output: `Satisfaction: ${(satisfaction * 100).toFixed(1)}%`,
    });

    // Retry loop if below target
    while (
      satisfaction < this.config.satisfactionTarget &&
      retryCount < this.config.maxRetries
    ) {
      retryCount++;
      const failingScenarios = holdoutResults.filter(r => r.verdict !== "PASS");

      // Re-implement with failure context
      const retryPrompt = `${specContent}\n\n## FAILING SCENARIOS (Retry ${retryCount})\n${failingScenarios.map(f => `- ${f.description}: ${f.feedback}`).join("\n")}`;

      try {
        implementation = await this.implementer.implement(retryPrompt, split.visible);
        holdoutResults = await this.runHoldoutTests(implementation, split.holdout);
        satisfaction = this.calculateSatisfaction(holdoutResults);
      } catch {
        break;
      }
    }

    // Phase 7: Report
    const reportStart = Date.now();
    const report = this.buildReport(specAnalysis, testScenarios, split, holdoutResults, phases, retryCount, start);
    phases.push({
      phase: "report",
      status: "completed",
      durationMs: Date.now() - reportStart,
    });

    return report;
  }

  /** Run holdout tests against implementation */
  private async runHoldoutTests(
    implementation: string,
    holdoutScenarios: TestScenario[],
  ): Promise<HoldoutResult[]> {
    const results: HoldoutResult[] = [];

    for (const scenario of holdoutScenarios) {
      try {
        const result = await this.evaluator.evaluate(implementation, scenario);
        results.push(result);
      } catch (err: any) {
        results.push({
          scenarioId: scenario.id,
          description: scenario.description,
          verdict: "FAIL",
          score: 0,
          feedback: `Evaluation error: ${err.message}`,
        });
      }
    }

    return results;
  }

  /** Calculate satisfaction score from holdout results */
  private calculateSatisfaction(results: HoldoutResult[]): number {
    if (results.length === 0) return 1.0;
    const total = results.reduce((sum, r) => sum + r.score, 0);
    return total / results.length;
  }

  /** Generate default test scenarios from spec analysis */
  private generateDefaultScenarios(spec: SpecAnalysis): TestScenario[] {
    const scenarios: TestScenario[] = [];
    let id = 1;

    // Generate functional scenario per section
    for (const section of spec.sections) {
      scenarios.push({
        id: `scenario-${id++}`,
        description: `Verify ${section} implementation matches spec`,
        type: "functional",
        priority: spec.missingCritical.length === 0 ? "high" : "medium",
        acceptanceCriteria: `${section} is correctly implemented as specified`,
      });
    }

    // Always add security scenario
    scenarios.push({
      id: `scenario-${id++}`,
      description: "Security validation: no critical vulnerabilities",
      type: "security",
      priority: "critical",
      acceptanceCriteria: "No OWASP Top 10 vulnerabilities present",
    });

    // Always add edge case
    scenarios.push({
      id: `scenario-${id++}`,
      description: "Edge case: handles invalid/empty input gracefully",
      type: "edge-case",
      priority: "high",
      acceptanceCriteria: "System returns appropriate errors for invalid inputs",
    });

    return scenarios;
  }

  /** Build the final factory report */
  private buildReport(
    spec: SpecAnalysis,
    scenarios: TestScenario[],
    split: HoldoutSplit,
    holdoutResults: HoldoutResult[],
    phases: PhaseResult[],
    retryCount: number,
    startTime: number,
  ): FactoryReport {
    const satisfaction = this.calculateSatisfaction(holdoutResults);
    const target = spec.satisfactionTarget || this.config.satisfactionTarget;

    let verdict: FactoryVerdict;
    if (phases.some(p => p.status === "failed")) {
      verdict = "FAIL";
    } else if (satisfaction >= target) {
      verdict = "PASS";
    } else if (satisfaction >= target * 0.8) {
      verdict = "WARN";
    } else {
      verdict = "FAIL";
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (spec.missingCritical.length > 0) {
      recommendations.push(`Add missing spec sections: ${spec.missingCritical.join(", ")}`);
    }
    if (retryCount > 0) {
      recommendations.push(`Implementation required ${retryCount} retries — consider simplifying spec`);
    }
    const failingHoldouts = holdoutResults.filter(r => r.verdict === "FAIL");
    if (failingHoldouts.length > 0) {
      recommendations.push(`${failingHoldouts.length} holdout scenarios failed — review edge cases`);
    }
    if (verdict === "PASS" && satisfaction === 1.0) {
      recommendations.push("Perfect score — consider adding more challenging scenarios");
    }

    return {
      specTitle: spec.title,
      specMaturity: spec.maturity,
      specQualityScore: spec.qualityScore,
      totalScenarios: scenarios.length,
      holdoutCount: split.holdout.length,
      visibleCount: split.visible.length,
      holdoutResults,
      satisfactionScore: satisfaction,
      satisfactionTarget: target,
      verdict,
      retryCount,
      phases,
      totalDurationMs: Date.now() - startTime,
      recommendations,
    };
  }

  /** Get current configuration */
  getConfig(): Readonly<FactoryConfig> {
    return { ...this.config };
  }
}
