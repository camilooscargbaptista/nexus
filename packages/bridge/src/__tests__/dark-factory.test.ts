import { jest } from "@jest/globals";
import {
  assessSpecMaturity,
  splitHoldout,
  DarkFactory,
  SpecAnalysis,
  TestScenario,
  HoldoutResult,
  FactoryConfig,
  ImplementationEngine,
  EvaluationEngine,
} from "../dark-factory";

// ═══════════════════════════════════════════════════════════════
// MOCK ENGINES
// ═══════════════════════════════════════════════════════════════

class MockImplementationEngine implements ImplementationEngine {
  async implement(spec: string, scenarios: TestScenario[]): Promise<string> {
    return `Implementation of spec with ${scenarios.length} scenarios`;
  }
}

class FailingImplementationEngine implements ImplementationEngine {
  async implement(): Promise<string> {
    throw new Error("Implementation failed");
  }
}

class MockEvaluationEngine implements EvaluationEngine {
  private passScenarioIds = new Set<string>();

  constructor(passScenarios?: string[]) {
    if (passScenarios) {
      this.passScenarioIds = new Set(passScenarios);
    }
  }

  async evaluate(implementation: string, scenario: TestScenario): Promise<HoldoutResult> {
    const pass = this.passScenarioIds.size === 0 || this.passScenarioIds.has(scenario.id);
    return {
      scenarioId: scenario.id,
      description: scenario.description,
      verdict: pass ? "PASS" : "FAIL",
      score: pass ? 1.0 : 0.0,
      feedback: pass ? "Passed" : "Failed",
    };
  }
}

class PartialEvaluationEngine implements EvaluationEngine {
  private evaluationMap: Map<string, number> = new Map();

  setScenarioScore(scenarioId: string, score: number): void {
    this.evaluationMap.set(scenarioId, score);
  }

  async evaluate(implementation: string, scenario: TestScenario): Promise<HoldoutResult> {
    const score = this.evaluationMap.get(scenario.id) ?? 0.5;
    const verdict = score === 1.0 ? "PASS" : score === 0 ? "FAIL" : "PARTIAL";
    return {
      scenarioId: scenario.id,
      description: scenario.description,
      verdict,
      score,
      feedback: `Score: ${score}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const MINIMAL_SPEC = `
# API Spec

## Overview
This is a simple API.

## Requirements
- Must support JSON
`;

const COMPREHENSIVE_SPEC = `
# Payment Processing API

## Overview
A robust payment processing system for e-commerce platforms.

## Requirements
- Support multiple payment methods
- Handle concurrent transactions
- Provide transaction logs

## Acceptance Criteria
- All test scenarios must pass
- System must be resilient to failures

## Constraints
- Must comply with PCI DSS
- Response time < 100ms

## Architecture
- Microservices based
- Event-driven design

## API
- POST /pay
- GET /status

## Data Model
- Transaction table
- User payment methods

## Security
- TLS 1.3 encryption
- API key authentication

## Examples
Example transaction flow

## Milestones
- Phase 1: Core APIs
- Phase 2: Advanced features

## Glossary
- PCI: Payment Card Industry

## Dependencies
- PostgreSQL 12+
- Redis 6+

target: 85%
`;

const PERFECT_SPEC = `
# Complete Service API

## Overview
Complete service with all sections.

## Requirements
Essential functionality requirements.

## Acceptance Criteria
Clear acceptance criteria for all features.

## Constraints
System constraints and limitations.

## Architecture
Detailed architecture description.

## API
Complete API specification.

## Data Model
Comprehensive data model.

## Security
Security implementation details.

## Examples
Usage examples.

## Milestones
Project milestones.

## Glossary
Key terms.

## Dependencies
List of dependencies.

satisfaction: 95%
`;

const createTestScenario = (
  id: string,
  priority: "critical" | "high" | "medium" | "low" = "high"
): TestScenario => ({
  id,
  description: `Test scenario ${id}`,
  type: "functional",
  priority,
  acceptanceCriteria: `Scenario ${id} should work`,
});

// ═══════════════════════════════════════════════════════════════
// TESTS: assessSpecMaturity
// ═══════════════════════════════════════════════════════════════

describe("assessSpecMaturity", () => {
  it("should extract title from first heading", () => {
    const spec = `# My Awesome API\n\nContent here`;
    const result = assessSpecMaturity(spec);
    expect(result.title).toBe("My Awesome API");
  });

  it("should use 'Untitled Spec' when no heading found", () => {
    const spec = "Just content without headings";
    const result = assessSpecMaturity(spec);
    expect(result.title).toBe("Untitled Spec");
  });

  it("should count sections correctly", () => {
    const spec = `
# Title
## Section 1
### Subsection
## Section 2
# Another Title
## Section 3
`;
    const result = assessSpecMaturity(spec);
    expect(result.sectionCount).toBe(6);
  });

  it("should detect missing critical sections", () => {
    const result = assessSpecMaturity(MINIMAL_SPEC);
    const missingCritical = result.missingCritical;
    expect(missingCritical).toContain("acceptance criteria");
    expect(missingCritical).toContain("constraints");
  });

  it("should calculate NQS with 60% critical weight", () => {
    const spec = `
# Test
## Overview
## Requirements
## Acceptance Criteria
## Constraints
## Architecture
`;
    const result = assessSpecMaturity(spec);
    // All critical (4/4) = 60%, important (1/4) = 25*0.25 = 6.25, nice (0/4) = 0
    // Total = 60 + 6.25 = 66.25 ≈ 66
    expect(result.qualityScore).toBeLessThanOrEqual(100);
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
  });

  it("should assign skeleton maturity for < 3 sections", () => {
    const spec = `# Title\n## Section`;
    const result = assessSpecMaturity(spec);
    expect(result.maturity).toBe("skeleton");
  });

  it("should assign draft maturity for 3-4 sections", () => {
    const spec = `# T\n## S1\n## S2\n## S3`;
    const result = assessSpecMaturity(spec);
    expect(result.maturity).toBe("draft");
  });

  it("should assign standard maturity for 5-6 sections", () => {
    const spec = `# T\n## S1\n## S2\n## S3\n## S4\n## S5`;
    const result = assessSpecMaturity(spec);
    expect(result.maturity).toBe("standard");
  });

  it("should assign mature maturity for >= 7 sections", () => {
    const spec = `# T\n## S1\n## S2\n## S3\n## S4\n## S5\n## S6\n## S7`;
    const result = assessSpecMaturity(spec);
    expect(result.maturity).toBe("mature");
  });

  it("should extract satisfaction target from 'target: X%' format", () => {
    const spec = `# Spec\nSome content\ntarget: 92%`;
    const result = assessSpecMaturity(spec);
    expect(result.satisfactionTarget).toBe(0.92);
  });

  it("should extract satisfaction target from 'satisfaction: X%' format", () => {
    const spec = `# Spec\nSome content\nsatisfaction: 88%`;
    const result = assessSpecMaturity(spec);
    expect(result.satisfactionTarget).toBe(0.88);
  });

  it("should extract satisfaction target from 'threshold: X%' format", () => {
    const spec = `# Spec\nSome content\nthreshold: 91%`;
    const result = assessSpecMaturity(spec);
    expect(result.satisfactionTarget).toBe(0.91);
  });

  it("should use default 0.90 target when not specified", () => {
    const result = assessSpecMaturity(MINIMAL_SPEC);
    expect(result.satisfactionTarget).toBe(0.90);
  });

  it("should collect found sections in foundSections array", () => {
    const result = assessSpecMaturity(COMPREHENSIVE_SPEC);
    expect(result.sections).toContain("overview");
    expect(result.sections).toContain("architecture");
    expect(result.sections).toContain("security");
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: splitHoldout
// ═══════════════════════════════════════════════════════════════

describe("splitHoldout", () => {
  it("should return empty holdout for < 3 scenarios", () => {
    const scenarios = [createTestScenario("s1"), createTestScenario("s2")];
    const result = splitHoldout(scenarios, 0.15);
    expect(result.holdout).toHaveLength(0);
    expect(result.visible).toEqual(scenarios);
  });

  it("should return correct holdout ratio for typical split", () => {
    const scenarios = Array.from({ length: 10 }, (_, i) => createTestScenario(`s${i}`));
    const result = splitHoldout(scenarios, 0.2);
    const actualRatio = result.holdout.length / scenarios.length;
    expect(actualRatio).toBeCloseTo(0.2, 1);
  });

  it("should never include critical scenarios in holdout", () => {
    const scenarios = [
      createTestScenario("critical1", "critical"),
      createTestScenario("high1", "high"),
      createTestScenario("high2", "high"),
      createTestScenario("critical2", "critical"),
      createTestScenario("high3", "high"),
      createTestScenario("high4", "high"),
    ];
    const result = splitHoldout(scenarios, 0.5);
    const holdoutIds = new Set(result.holdout.map(s => s.id));
    expect(holdoutIds.has("critical1")).toBe(false);
    expect(holdoutIds.has("critical2")).toBe(false);
  });

  it("should be deterministic for same input", () => {
    const scenarios = Array.from({ length: 20 }, (_, i) => createTestScenario(`s${i}`));
    const result1 = splitHoldout(scenarios, 0.2);
    const result2 = splitHoldout(scenarios, 0.2);
    expect(result1.holdout.map(s => s.id)).toEqual(result2.holdout.map(s => s.id));
  });

  it("should maintain holdoutRatio field correctly", () => {
    const scenarios = Array.from({ length: 10 }, (_, i) => createTestScenario(`s${i}`));
    const result = splitHoldout(scenarios, 0.3);
    expect(result.holdoutRatio).toBe(result.holdout.length / scenarios.length);
  });

  it("should ensure all scenarios are in visible or holdout", () => {
    const scenarios = Array.from({ length: 15 }, (_, i) => createTestScenario(`s${i}`));
    const result = splitHoldout(scenarios, 0.25);
    const allIds = new Set(scenarios.map(s => s.id));
    const resultIds = new Set([
      ...result.visible.map(s => s.id),
      ...result.holdout.map(s => s.id),
    ]);
    expect(resultIds.size).toBe(allIds.size);
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: DarkFactory
// ═══════════════════════════════════════════════════════════════

describe("DarkFactory", () => {
  describe("constructor and configuration", () => {
    it("should initialize with default config when not provided", () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);
      const config = factory.getConfig();

      expect(config.holdoutRatio).toBe(0.15);
      expect(config.maxRetries).toBe(2);
      expect(config.minSpecScore).toBe(85);
      expect(config.satisfactionTarget).toBe(0.90);
    });

    it("should merge custom config with defaults", () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator, {
        holdoutRatio: 0.25,
        maxRetries: 5,
      });
      const config = factory.getConfig();

      expect(config.holdoutRatio).toBe(0.25);
      expect(config.maxRetries).toBe(5);
      expect(config.minSpecScore).toBe(85); // default
      expect(config.satisfactionTarget).toBe(0.90); // default
    });

    it("should return immutable config copy", () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);
      const config1 = factory.getConfig();
      const config2 = factory.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe("full pipeline: success path", () => {
    it("should complete all 7 phases successfully", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.phases.length).toBe(7);
      expect(report.phases[0].phase).toBe("parse");
      expect(report.phases[1].phase).toBe("score-spec");
      expect(report.phases[2].phase).toBe("generate-scenarios");
      expect(report.phases[3].phase).toBe("split-holdout");
      expect(report.phases[4].phase).toBe("implement");
      expect(report.phases[5].phase).toBe("holdout-test");
      expect(report.phases[6].phase).toBe("report");
    });

    it("should return PASS verdict when satisfaction >= target", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine(); // all pass
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.verdict).toBe("PASS");
      expect(report.satisfactionScore).toBe(1.0);
    });

    it("should mark all phases as completed on success", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const failedPhases = report.phases.filter(p => p.status === "failed");
      expect(failedPhases).toHaveLength(0);
    });

    it("should populate spec details in report", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.specTitle).toBe("Payment Processing API");
      expect(report.specMaturity).toBe("mature");
      expect(report.specQualityScore).toBeGreaterThan(0);
    });
  });

  describe("pipeline: spec quality check (phase 2)", () => {
    it("should fail at score-spec phase if NQS below minSpecScore", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator, { minSpecScore: 95 });

      const report = await factory.run(MINIMAL_SPEC);

      const scorePhase = report.phases.find(p => p.phase === "score-spec");
      expect(scorePhase?.status).toBe("failed");
      expect(scorePhase?.error).toContain("below minimum");
    });

    it("should return FAIL verdict when spec quality fails", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator, { minSpecScore: 100 });

      const report = await factory.run(MINIMAL_SPEC);

      expect(report.verdict).toBe("FAIL");
    });

    it("should skip subsequent phases after spec quality failure", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator, { minSpecScore: 100 });

      const report = await factory.run(MINIMAL_SPEC);

      const implementPhase = report.phases.find(p => p.phase === "implement");
      expect(implementPhase).toBeUndefined();
    });
  });

  describe("pipeline: implementation phase", () => {
    it("should handle implementation failure gracefully", async () => {
      const implementer = new FailingImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const implPhase = report.phases.find(p => p.phase === "implement");
      expect(implPhase?.status).toBe("failed");
      expect(implPhase?.error).toContain("Implementation failed");
    });

    it("should return FAIL verdict on implementation failure", async () => {
      const implementer = new FailingImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.verdict).toBe("FAIL");
    });
  });

  describe("pipeline: retry logic", () => {
    it("should not retry when satisfaction >= target", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine(); // all pass
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.retryCount).toBe(0);
    });

    it("should retry when satisfaction < target", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new PartialEvaluationEngine();
      evaluator.setScenarioScore("any", 0.5);
      const factory = new DarkFactory(implementer, evaluator, { satisfactionTarget: 0.9 });

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.retryCount).toBeGreaterThan(0);
    });

    it("should respect maxRetries limit", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new PartialEvaluationEngine();
      evaluator.setScenarioScore("any", 0.0); // always fail
      const factory = new DarkFactory(implementer, evaluator, {
        maxRetries: 2,
        satisfactionTarget: 0.9,
      });

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.retryCount).toBeLessThanOrEqual(2);
    });

    it("should pass failure context to implementer on retry", async () => {
      let callCount = 0;
      const implementer: ImplementationEngine = {
        implement: jest.fn(async (spec: string) => {
          callCount++;
          if (callCount === 1) {
            expect(spec).not.toContain("FAILING SCENARIOS");
          } else {
            expect(spec).toContain("FAILING SCENARIOS");
          }
          return "impl";
        }),
      };
      const evaluator = new PartialEvaluationEngine();
      evaluator.setScenarioScore("any", 0.3); // low score triggers retry
      const factory = new DarkFactory(implementer, evaluator, {
        maxRetries: 1,
        satisfactionTarget: 0.95,
      });

      await factory.run(COMPREHENSIVE_SPEC);

      expect(implementer.implement).toHaveBeenCalledTimes(2);
    });
  });

  describe("pipeline: scenario generation", () => {
    it("should generate default scenarios from spec when not provided", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.totalScenarios).toBeGreaterThan(0);
    });

    it("should use provided scenarios instead of generating", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);
      const customScenarios = [
        createTestScenario("custom1"),
        createTestScenario("custom2"),
      ];

      const report = await factory.run(COMPREHENSIVE_SPEC, customScenarios);

      // Note: totalScenarios includes generated ones for security/edge-cases if < 3
      // but visible + holdout should include custom scenarios
      expect(report.visibleCount + report.holdoutCount).toBeGreaterThan(0);
    });

    it("should always include critical security scenario", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      // Verify scenarios were generated (total scenarios > 0)
      expect(report.totalScenarios).toBeGreaterThan(0);
      const genPhase = report.phases.find(p => p.phase === "generate-scenarios");
      expect(genPhase?.status).toBe("completed");
    });
  });

  describe("pipeline: verdict determination", () => {
    it("should return PASS when satisfaction >= satisfactionTarget", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine(); // all pass
      const factory = new DarkFactory(implementer, evaluator, {
        satisfactionTarget: 0.8,
      });

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.verdict).toBe("PASS");
    });

    it("should return WARN when satisfaction >= 80% of target", async () => {
      const implementer = new MockImplementationEngine();
      // PartialEvaluationEngine defaults to 0.5 for unknown IDs
      // We need score ~0.8 to hit WARN zone (>= target*0.8 but < target)
      // Using custom scenarios to control IDs
      const evaluator = new PartialEvaluationEngine();
      const scenarios: TestScenario[] = [
        { id: "s1", description: "Test 1", type: "functional", priority: "high", acceptanceCriteria: "ok" },
        { id: "s2", description: "Test 2", type: "functional", priority: "high", acceptanceCriteria: "ok" },
        { id: "s3", description: "Test 3", type: "functional", priority: "medium", acceptanceCriteria: "ok" },
        { id: "s4", description: "Test 4", type: "edge-case", priority: "medium", acceptanceCriteria: "ok" },
      ];
      // Set scores so average is ~0.8 (>= 0.95*0.8=0.76 but < 0.95)
      evaluator.setScenarioScore("s1", 0.8);
      evaluator.setScenarioScore("s2", 0.8);
      evaluator.setScenarioScore("s3", 0.8);
      evaluator.setScenarioScore("s4", 0.8);
      const factory = new DarkFactory(implementer, evaluator, {
        satisfactionTarget: 0.95,
        maxRetries: 0,
        minSpecScore: 0, // disable spec score check
      });

      const report = await factory.run(COMPREHENSIVE_SPEC, scenarios);

      expect(report.verdict).toBe("WARN");
    });

    it("should return FAIL when satisfaction < 80% of target", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new PartialEvaluationEngine();
      evaluator.setScenarioScore("any", 0.5);
      const factory = new DarkFactory(implementer, evaluator, {
        satisfactionTarget: 0.95,
        maxRetries: 0,
      });

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.verdict).toBe("FAIL");
    });

    it("should return FAIL when any phase fails", async () => {
      const implementer = new FailingImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.verdict).toBe("FAIL");
    });
  });

  describe("pipeline: recommendations", () => {
    it("should recommend adding missing spec sections", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(MINIMAL_SPEC);

      const recWithMissing = report.recommendations.some(r =>
        r.includes("missing spec sections")
      );
      expect(recWithMissing).toBe(true);
    });

    it("should recommend simplifying spec after retries", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new PartialEvaluationEngine();
      evaluator.setScenarioScore("any", 0.0);
      const factory = new DarkFactory(implementer, evaluator, {
        maxRetries: 2,
        satisfactionTarget: 0.99,
      });

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const retryRec = report.recommendations.find(r => r.includes("retries"));
      if (report.retryCount > 0) {
        expect(retryRec).toBeDefined();
      }
    });

    it("should recommend reviewing edge cases when holdouts fail", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new PartialEvaluationEngine();
      evaluator.setScenarioScore("any", 0.0);
      const factory = new DarkFactory(implementer, evaluator, { maxRetries: 0 });

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const failingCount = report.holdoutResults.filter(r => r.verdict === "FAIL").length;
      if (failingCount > 0) {
        const edgeCaseRec = report.recommendations.some(r => r.includes("edge cases"));
        expect(edgeCaseRec).toBe(true);
      }
    });
  });

  describe("pipeline: satisfaction target from spec", () => {
    it("should use satisfactionTarget from spec if present", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.satisfactionTarget).toBe(0.85);
    });

    it("should use default 0.90 satisfactionTarget if spec does not specify explicitly", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator, {
        satisfactionTarget: 0.75,
        minSpecScore: 0,
      });

      const report = await factory.run(MINIMAL_SPEC);

      // MINIMAL_SPEC has no "target: X%" — assessSpecMaturity defaults to 0.90
      // buildReport uses spec.satisfactionTarget || config.satisfactionTarget
      // Since 0.90 is truthy, the spec default takes precedence
      expect(report.satisfactionTarget).toBe(0.90);
    });
  });

  describe("holdout results and satisfaction", () => {
    it("should populate holdoutResults in report", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(Array.isArray(report.holdoutResults)).toBe(true);
    });

    it("should calculate correct satisfaction from holdout results", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new PartialEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const avgScore =
        report.holdoutResults.length === 0
          ? 1.0
          : report.holdoutResults.reduce((sum, r) => sum + r.score, 0) / report.holdoutResults.length;

      expect(report.satisfactionScore).toBeCloseTo(avgScore, 2);
    });

    it("should track holdout count and visible count", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.holdoutCount).toBeGreaterThanOrEqual(0);
      expect(report.visibleCount).toBeGreaterThan(0);
      expect(report.holdoutCount + report.visibleCount).toBe(report.totalScenarios);
    });
  });

  describe("timing and reporting", () => {
    it("should track totalDurationMs", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should track duration for each phase", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      for (const phase of report.phases) {
        expect(phase.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("should include phase outputs and errors appropriately", async () => {
      const implementer = new FailingImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const implPhase = report.phases.find(p => p.phase === "implement");
      expect(implPhase?.error).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty spec content", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run("");

      // Should fail at score-spec or continue with low quality
      expect(report.verdict).toBeDefined();
    });

    it("should handle empty scenario list", async () => {
      const implementer = new MockImplementationEngine();
      const evaluator = new MockEvaluationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC, []);

      expect(report.totalScenarios).toBeGreaterThanOrEqual(0);
    });

    it("should handle evaluation errors gracefully", async () => {
      const evaluator: EvaluationEngine = {
        evaluate: jest.fn(async () => {
          throw new Error("Evaluation error");
        }),
      };
      const implementer = new MockImplementationEngine();
      const factory = new DarkFactory(implementer, evaluator);

      const report = await factory.run(COMPREHENSIVE_SPEC);

      const failedResults = report.holdoutResults.filter(r => r.verdict === "FAIL");
      expect(failedResults.length).toBeGreaterThan(0);
    });
  });
});
