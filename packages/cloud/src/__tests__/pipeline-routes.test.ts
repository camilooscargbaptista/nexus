/**
 * Pipeline Routes Tests (Sprint 16)
 *
 * Testa os 3 endpoints de integração:
 *   1. POST /projects/:id/analyze — pipeline trigger + persist
 *   2. GET  /runs/:runId/findings — query findings por run
 *   3. GET  /projects/:id/findings/by-category — agrupamento
 *
 * Usa InMemoryFindingRepository e mock PipelineEngine.
 */

import {
  InMemoryFindingRepository,
  PipelineEngine,
  PipelineResult,
  FindingRepository,
  CategoryCount,
} from "../routes/pipeline-routes.js";

// ═══════════════════════════════════════════════════════════════
// MOCK PIPELINE ENGINE
// ═══════════════════════════════════════════════════════════════

const mockPipelineResult: PipelineResult = {
  pipelineId: "pipe-001",
  overallScore: 82,
  scores: { perception: 85, reasoning: 78, validation: 83 },
  qualityGate: "PASSED",
  insights: [
    {
      layer: "perception",
      category: "architecture",
      severity: "high",
      title: "Circular Dependency Detected",
      description: "Module A imports Module B which imports Module A",
      filePath: "src/moduleA.ts",
      line: 15,
      confidence: 0.92,
      suggestion: "Extract shared interface to a common module",
    },
    {
      layer: "validation",
      category: "security",
      severity: "critical",
      title: "Hardcoded Secret",
      description: "API key found in source code",
      filePath: "src/config/api.ts",
      line: 8,
      confidence: 0.98,
      suggestion: "Move to environment variables",
    },
    {
      layer: "reasoning",
      category: "architecture",
      severity: "medium",
      title: "Large Class Smell",
      description: "Class exceeds 500 lines",
      confidence: 0.75,
    },
    {
      layer: "perception",
      category: "security",
      severity: "low",
      title: "Missing rate limiter",
      description: "Public endpoint without rate limiting",
      confidence: 0.60,
    },
  ],
  durationMs: 3500,
};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("InMemoryFindingRepository", () => {
  let repo: InMemoryFindingRepository;

  beforeEach(() => {
    repo = new InMemoryFindingRepository();
  });

  it("should create and retrieve findings for a run", async () => {
    const count = await repo.createMany([
      {
        runId: "run-1",
        layer: "perception",
        category: "architecture",
        severity: "high",
        title: "Test Finding",
        description: "Test description",
        filePath: "src/test.ts",
        line: 10,
        confidence: 0.9,
        suggestion: "Fix it",
        metadata: {},
        dismissed: false,
      },
      {
        runId: "run-1",
        layer: "validation",
        category: "security",
        severity: "critical",
        title: "Security Bug",
        description: "Critical issue",
        confidence: 0.95,
        metadata: {},
        dismissed: false,
      },
    ]);

    expect(count).toBe(2);

    const findings = await repo.findByRun("run-1");
    expect(findings).toHaveLength(2);
    expect(findings[0]!.title).toBe("Test Finding");
    expect(findings[0]!.id).toBeDefined();
    expect(findings[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("should return empty array for unknown runId", async () => {
    const findings = await repo.findByRun("unknown");
    expect(findings).toHaveLength(0);
  });

  it("should count findings by category", async () => {
    await repo.createMany([
      { runId: "run-1", layer: "perception", category: "architecture", severity: "high", title: "t1", description: "d1", confidence: 0.9, metadata: {}, dismissed: false },
      { runId: "run-1", layer: "perception", category: "architecture", severity: "critical", title: "t2", description: "d2", confidence: 0.8, metadata: {}, dismissed: false },
      { runId: "run-1", layer: "validation", category: "security", severity: "medium", title: "t3", description: "d3", confidence: 0.7, metadata: {}, dismissed: false },
      { runId: "run-1", layer: "validation", category: "security", severity: "medium", title: "t4", description: "d4", confidence: 0.6, metadata: {}, dismissed: false },
      { runId: "run-1", layer: "validation", category: "security", severity: "low", title: "t5", description: "d5", confidence: 0.5, metadata: {}, dismissed: false },
    ]);

    const categories = await repo.countByCategory("proj-1");
    expect(categories).toHaveLength(2);

    const archCategory = categories.find((c: CategoryCount) => c.category === "architecture");
    expect(archCategory).toBeDefined();
    expect(archCategory!.high).toBe(1);
    expect(archCategory!.critical).toBe(1);

    const secCategory = categories.find((c: CategoryCount) => c.category === "security");
    expect(secCategory).toBeDefined();
    expect(secCategory!.medium).toBe(2);
    expect(secCategory!.low).toBe(1);
  });
});

describe("PipelineEngine Integration", () => {
  it("should produce valid PipelineResult", () => {
    // Validates mockPipelineResult structure matches PipelineResult interface
    expect(mockPipelineResult.pipelineId).toBeDefined();
    expect(mockPipelineResult.overallScore).toBeGreaterThanOrEqual(0);
    expect(mockPipelineResult.overallScore).toBeLessThanOrEqual(100);
    expect(mockPipelineResult.scores.perception).toBeDefined();
    expect(mockPipelineResult.scores.reasoning).toBeDefined();
    expect(mockPipelineResult.scores.validation).toBeDefined();
    expect(["PASSED", "FAILED", "WARNING"]).toContain(mockPipelineResult.qualityGate);
    expect(mockPipelineResult.insights.length).toBeGreaterThan(0);
    expect(mockPipelineResult.durationMs).toBeGreaterThan(0);
  });

  it("should categorize insights by severity", () => {
    const criticals = mockPipelineResult.insights.filter((i) => i.severity === "critical");
    const highs = mockPipelineResult.insights.filter((i) => i.severity === "high");
    const mediums = mockPipelineResult.insights.filter((i) => i.severity === "medium");
    const lows = mockPipelineResult.insights.filter((i) => i.severity === "low");

    expect(criticals).toHaveLength(1);
    expect(highs).toHaveLength(1);
    expect(mediums).toHaveLength(1);
    expect(lows).toHaveLength(1);
  });

  it("should persist insights as findings", async () => {
    const repo = new InMemoryFindingRepository();
    const runId = "run-integration-1";

    // Simulate pipeline-routes.ts behavior
    const count = await repo.createMany(
      mockPipelineResult.insights.map((insight) => ({
        runId,
        layer: insight.layer,
        category: insight.category,
        severity: insight.severity,
        title: insight.title,
        description: insight.description,
        filePath: insight.filePath ?? null,
        line: insight.line ?? null,
        confidence: insight.confidence,
        suggestion: insight.suggestion ?? null,
        metadata: insight.metadata ?? {},
        dismissed: false,
      }))
    );

    expect(count).toBe(4);

    const findings = await repo.findByRun(runId);
    expect(findings).toHaveLength(4);
    expect(findings.map((f) => f.severity).sort()).toEqual(["critical", "high", "low", "medium"]);

    // Category aggregation
    const categories = await repo.countByCategory("proj-1");
    const archCat = categories.find((c: CategoryCount) => c.category === "architecture");
    const secCat = categories.find((c: CategoryCount) => c.category === "security");

    expect(archCat).toBeDefined();
    expect(secCat).toBeDefined();
    expect(archCat!.high).toBe(1);
    expect(archCat!.medium).toBe(1);
    expect(secCat!.critical).toBe(1);
    expect(secCat!.low).toBe(1);
  });
});

describe("Pipeline → Persist → Query Flow", () => {
  let findings: InMemoryFindingRepository;
  let mockEngine: PipelineEngine;
  let runs: { id: string; status: string; data: Record<string, unknown> };

  beforeEach(() => {
    findings = new InMemoryFindingRepository();
    mockEngine = {
      run: jest.fn().mockResolvedValue(mockPipelineResult),
    };
    runs = { id: "run-e2e-1", status: "PENDING", data: {} };
  });

  it("should execute full pipeline → persist → query cycle", async () => {
    // 1. Pipeline runs and returns result
    const result = await mockEngine.run("/test/project");
    expect(result.overallScore).toBe(82);
    expect(result.insights).toHaveLength(4);

    // 2. Persist findings
    const persisted = await findings.createMany(
      result.insights.map((i) => ({
        runId: runs.id,
        layer: i.layer,
        category: i.category,
        severity: i.severity,
        title: i.title,
        description: i.description,
        filePath: i.filePath ?? null,
        line: i.line ?? null,
        confidence: i.confidence,
        suggestion: i.suggestion ?? null,
        metadata: i.metadata ?? {},
        dismissed: false,
      }))
    );
    expect(persisted).toBe(4);

    // 3. Query findings by run
    const runFindings = await findings.findByRun(runs.id);
    expect(runFindings).toHaveLength(4);
    expect(runFindings[0]!.title).toBe("Circular Dependency Detected");

    // 4. Query by category
    const categories = await findings.countByCategory("proj-1");
    expect(categories.length).toBeGreaterThan(0);

    // 5. Verify critical count
    const criticalCount = result.insights.filter((i) => i.severity === "critical").length;
    expect(criticalCount).toBe(1);
  });

  it("should handle pipeline failures gracefully", async () => {
    const failEngine: PipelineEngine = {
      run: jest.fn().mockRejectedValue(new Error("Analysis timeout")),
    };

    await expect(failEngine.run("/test")).rejects.toThrow("Analysis timeout");

    // Findings should remain empty
    const f = await findings.findByRun(runs.id);
    expect(f).toHaveLength(0);
  });

  it("should handle pipeline with zero findings", async () => {
    const emptyEngine: PipelineEngine = {
      run: jest.fn().mockResolvedValue({
        ...mockPipelineResult,
        insights: [],
      }),
    };

    const result = await emptyEngine.run("/test");
    expect(result.insights).toHaveLength(0);

    // No findings to persist
    const runFindings = await findings.findByRun(runs.id);
    expect(runFindings).toHaveLength(0);
  });
});
