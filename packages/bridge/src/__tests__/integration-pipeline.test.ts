/**
 * Integration Test — Full Nexus Pipeline E2E
 *
 * Tests the complete flow from Architect analysis through
 * Toolkit routing to Sentinel validation, using mock adapters.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { NexusEventBus } from "@camilooscargbaptista/nexus-events";
import { ArchitectAdapter } from "../architect-adapter.js";
import { SentinelAdapter } from "../sentinel-adapter.js";
import { ToolkitRouter } from "../toolkit-router.js";
import { ReactionEngine } from "../reaction-engine.js";
import { transformReport } from "../architect-bridge.js";
import type { ArchitectAnalysisReport } from "../architect-adapter.js";
import type { SentinelValidationResult } from "../sentinel-adapter.js";
import type { ActionExecutor, SystemEvent } from "../reaction-engine.js";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

let eventCounter = 0;
function makeEvent(overrides: Partial<SystemEvent> & { type: string }): SystemEvent {
  return {
    id: `evt-${++eventCounter}`,
    source: "monitor",
    severity: "info",
    title: overrides.type,
    description: "",
    metadata: {},
    timestamp: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════

function createMockArchitectReport(): ArchitectAnalysisReport {
  return {
    projectInfo: {
      name: "test-project",
      path: "/test/project",
      files: 45,
      lines: 5000,
      frameworks: ["typescript", "express"],
      domain: "devtools",
    },
    score: {
      overall: 72,
      breakdown: {
        modularity: 80,
        coupling: 65,
        cohesion: 75,
        layering: 68,
      },
    },
    layers: [
      { name: "API", type: "api", files: ["src/routes.ts", "src/controllers.ts"] },
      { name: "Service", type: "service", files: ["src/analyzer.ts", "src/scorer.ts"] },
      { name: "Data", type: "data", files: ["src/types.ts", "src/models.ts"] },
      { name: "Infrastructure", type: "infrastructure", files: ["src/config.ts"] },
    ],
    antiPatterns: [
      {
        name: "god_class",
        severity: "HIGH",
        location: "src/scanner.ts",
        description: "ProjectScanner has too many responsibilities",
        files: ["src/scanner.ts"],
        suggestion: "Extract FileFilter and ConfigManager classes",
      },
      {
        name: "circular_dependency",
        severity: "MEDIUM",
        location: "src/analyzer.ts",
        description: "analyzer.ts and scorer.ts have circular imports",
        files: ["src/analyzer.ts", "src/scorer.ts"],
        suggestion: "Extract shared types to a common module",
      },
    ],
    dependencies: [
      { source: "src/routes.ts", target: "src/analyzer.ts", type: "import", weight: 1 },
      { source: "src/analyzer.ts", target: "src/scorer.ts", type: "import", weight: 1 },
      { source: "src/scorer.ts", target: "src/types.ts", type: "import", weight: 1 },
    ],
  };
}

function createMockSentinelResult(): SentinelValidationResult {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    sourceDirectory: "/test/project",
    duration: 1200,
    summary: {
      totalFiles: 45,
      passedChecks: 38,
      failedChecks: 7,
      warnings: 12,
    },
    results: [
      {
        validator: "security",
        passed: true,
        score: 85,
        threshold: 70,
        issues: [
          { severity: "medium", code: "SEC-001", message: "Potential XSS in template rendering", file: "src/views.ts", line: 42, suggestion: "Use escape function" },
        ],
        details: {},
      },
      {
        validator: "testing",
        passed: false,
        score: 55,
        threshold: 70,
        issues: [
          { severity: "high", code: "TEST-001", message: "Coverage below threshold: 55%", suggestion: "Add tests for uncovered modules" },
          { severity: "medium", code: "TEST-002", message: "No integration tests found", suggestion: "Add integration test suite" },
        ],
        details: {},
      },
      {
        validator: "performance",
        passed: true,
        score: 90,
        threshold: 70,
        issues: [],
        details: {},
      },
    ],
    exitCode: 1,
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("Integration — Full Pipeline Flow", () => {
  let eventBus: NexusEventBus;

  beforeEach(() => {
    eventBus = new NexusEventBus();
  });

  // ── Architect Adapter ─────────────────────────────────────

  describe("ArchitectAdapter", () => {
    it("should analyze and transform report via mock module", async () => {
      const adapter = new ArchitectAdapter(eventBus);
      const mockReport = createMockArchitectReport();

      const mockModule = {
        analyze: async (_path: string) => mockReport,
      };

      const snapshot = await adapter.analyze("/test/project", mockModule);

      expect(snapshot.projectName).toBe("test-project");
      expect(snapshot.score.overall).toBe(72);
      expect(snapshot.score.modularity).toBe(80);
      expect(snapshot.score.coupling).toBe(65);
      expect(snapshot.antiPatterns.length).toBe(2);
      expect(snapshot.layers.length).toBe(4);
      expect(snapshot.dependencies.length).toBe(3);
      expect(snapshot.fileCount).toBe(45);
    });

    it("should emit architecture.analyzed event", async () => {
      const adapter = new ArchitectAdapter(eventBus);
      const events: string[] = [];

      eventBus.on("architecture.analyzed" as any, () => {
        events.push("architecture.analyzed");
      });

      const mockModule = {
        analyze: async () => createMockArchitectReport(),
      };

      await adapter.analyze("/test/project", mockModule);
      expect(events).toContain("architecture.analyzed");
    });

    it("should emit anti_pattern.detected for HIGH severity", async () => {
      const adapter = new ArchitectAdapter(eventBus);
      const events: string[] = [];

      eventBus.on("anti_pattern.detected" as any, () => {
        events.push("anti_pattern.detected");
      });

      const mockModule = {
        analyze: async () => createMockArchitectReport(),
      };

      await adapter.analyze("/test/project", mockModule);
      // God Class is HIGH → should emit; Circular Dependency is MEDIUM → should not
      expect(events.length).toBe(1);
    });
  });

  // ── Toolkit Router ────────────────────────────────────────

  describe("ToolkitRouter", () => {
    it("should route architect findings to relevant skills", async () => {
      const router = new ToolkitRouter(eventBus);
      const adapter = new ArchitectAdapter(eventBus);

      const mockModule = {
        analyze: async () => createMockArchitectReport(),
      };

      const snapshot = await adapter.analyze("/test/project", mockModule);
      const results = await router.route(snapshot);

      expect(results.length).toBeGreaterThan(0);

      // Should match design-patterns skill (god_class anti-pattern trigger)
      const designPatterns = results.find((r) => r.skillName === "design-patterns");
      expect(designPatterns).toBeDefined();
      expect(designPatterns!.findings.length).toBeGreaterThan(0);

      // Should match adr skill (circular_dependency trigger)
      const adr = results.find((r) => r.skillName === "adr");
      expect(adr).toBeDefined();
    });

    it("should route based on score thresholds", async () => {
      const router = new ToolkitRouter(eventBus);
      const adapter = new ArchitectAdapter(eventBus);

      // Create report with low coupling score
      const report = createMockArchitectReport();
      report.score.breakdown.coupling = 45; // Below 50 threshold

      const mockModule = { analyze: async () => report };
      const snapshot = await adapter.analyze("/test/project", mockModule);
      const results = await router.route(snapshot);

      // design-patterns has trigger for coupling<50
      const dp = results.find((r) => r.skillName === "design-patterns");
      expect(dp).toBeDefined();
    });

    it("should route based on framework detection", async () => {
      const router = new ToolkitRouter(eventBus);
      const adapter = new ArchitectAdapter(eventBus);

      const report = createMockArchitectReport();
      report.projectInfo.frameworks = ["react", "typescript"];

      const mockModule = { analyze: async () => report };
      const snapshot = await adapter.analyze("/test/project", mockModule);
      const results = await router.route(snapshot);

      // frontend-review should trigger for react framework
      const frontend = results.find((r) => r.skillName === "frontend-review");
      expect(frontend).toBeDefined();
    });

    it("should emit skill.triggered events", async () => {
      const router = new ToolkitRouter(eventBus);
      const adapter = new ArchitectAdapter(eventBus);
      const skillEvents: string[] = [];

      eventBus.on("skill.triggered" as any, (event: any) => {
        skillEvents.push(event.data?.skillName ?? "unknown");
      });

      const mockModule = { analyze: async () => createMockArchitectReport() };
      const snapshot = await adapter.analyze("/test/project", mockModule);
      await router.route(snapshot);

      expect(skillEvents.length).toBeGreaterThan(0);
    });
  });

  // ── Sentinel Adapter ──────────────────────────────────────

  describe("SentinelAdapter", () => {
    it("should validate and transform result via mock module", async () => {
      const adapter = new SentinelAdapter(eventBus);
      const mockResult = createMockSentinelResult();

      const mockModule = {
        validate: async () => mockResult,
      };

      const snapshot = await adapter.validate("/test/project", undefined, mockModule);

      expect(snapshot.projectPath).toBe("/test/project");
      expect(snapshot.success).toBe(true);
      expect(snapshot.validators.length).toBe(3);
      expect(snapshot.overallScore).toBeGreaterThan(0);
      expect(snapshot.issueCount.total).toBe(3);
    });

    it("should emit validation.completed event", async () => {
      const adapter = new SentinelAdapter(eventBus);
      const events: string[] = [];

      eventBus.on("validation.completed" as any, () => {
        events.push("validation.completed");
      });

      const mockModule = { validate: async () => createMockSentinelResult() };
      await adapter.validate("/test/project", undefined, mockModule);

      expect(events).toContain("validation.completed");
    });

    it("should emit quality_gate.passed for successful validation", async () => {
      const adapter = new SentinelAdapter(eventBus);
      const gateEvents: string[] = [];

      eventBus.on("quality_gate.passed" as any, () => {
        gateEvents.push("passed");
      });
      eventBus.on("quality_gate.failed" as any, () => {
        gateEvents.push("failed");
      });

      const mockModule = { validate: async () => createMockSentinelResult() };
      await adapter.validate("/test/project", undefined, mockModule);

      expect(gateEvents).toContain("passed");
    });
  });

  // ── Architect Bridge ──────────────────────────────────────

  describe("Architect Bridge — transformReport", () => {
    it("should transform raw architect report to bridged format", () => {
      const rawReport = {
        timestamp: new Date().toISOString(),
        projectInfo: {
          path: "/test/project",
          name: "test-project",
          frameworks: ["typescript"],
          totalFiles: 30,
          totalLines: 3000,
          primaryLanguages: ["TypeScript"],
        },
        score: {
          overall: 78,
          breakdown: { modularity: 82, coupling: 71, cohesion: 80, layering: 75 },
        },
        layers: [
          { name: "Service", files: ["src/a.ts", "src/b.ts"], description: "Business logic" },
        ],
        antiPatterns: [
          {
            name: "God Class",
            severity: "HIGH",
            location: "src/big.ts",
            description: "Too large",
            suggestion: "Split it",
            affectedFiles: ["src/big.ts", "src/helper.ts"],
          },
        ],
        dependencyGraph: {
          nodes: ["src/a.ts", "src/b.ts"],
          edges: [{ from: "src/a.ts", to: "src/b.ts", type: "import", weight: 1 }],
        },
      };

      const bridged = transformReport(rawReport);

      expect(bridged.projectInfo.name).toBe("test-project");
      expect(bridged.projectInfo.files).toBe(30);
      expect(bridged.projectInfo.lines).toBe(3000);
      expect(bridged.score.overall).toBe(78);
      expect(bridged.layers[0]!.type).toBe("service");
      expect(bridged.antiPatterns[0]!.files).toEqual(["src/big.ts", "src/helper.ts"]);
      expect(bridged.dependencies[0]!.source).toBe("src/a.ts");
      expect(bridged.dependencies[0]!.target).toBe("src/b.ts");
    });

    it("should infer devtools domain from analyzer-related files", () => {
      const rawReport = {
        timestamp: new Date().toISOString(),
        projectInfo: {
          path: "/test", name: "my-linter", frameworks: ["typescript"],
          totalFiles: 10, totalLines: 1000, primaryLanguages: ["TypeScript"],
        },
        score: { overall: 80, breakdown: { modularity: 80, coupling: 80, cohesion: 80, layering: 80 } },
        layers: [],
        antiPatterns: [],
        dependencyGraph: {
          nodes: ["src/parser.ts", "src/ast-walker.ts", "src/linter.ts"],
          edges: [
            { from: "src/parser.ts", to: "src/ast-walker.ts", type: "import", weight: 1 },
            { from: "src/ast-walker.ts", to: "src/linter.ts", type: "import", weight: 1 },
          ],
        },
      };

      const bridged = transformReport(rawReport);
      expect(bridged.projectInfo.domain).toBe("devtools");
    });
  });

  // ── Reaction Engine + Pipeline Events ─────────────────────

  describe("ReactionEngine with pipeline events", () => {
    it("should react to matching events using default rules", async () => {
      const actions: Array<{ action: string; event: string }> = [];
      const executor: ActionExecutor = {
        execute: async (action, event, _ctx) => {
          actions.push({ action, event: event.type });
          return `OK: ${action}`;
        },
      };

      const engine = new ReactionEngine(executor);

      // ci.failed with critical severity matches the default "ci-critical-failure" rule
      await engine.processEvent(makeEvent({
        type: "ci.failed",
        source: "ci",
        severity: "critical",
      }));

      const stats = engine.getStats();
      expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
      expect(stats.totalReactions).toBeGreaterThanOrEqual(1);
    });

    it("should not react to non-matching events", async () => {
      const executor: ActionExecutor = {
        execute: async (action, _event, _ctx) => `OK: ${action}`,
      };

      const engine = new ReactionEngine(executor);

      // This event type doesn't match any default rule
      await engine.processEvent(makeEvent({
        type: "custom.unknown.event",
        severity: "info",
      }));

      const stats = engine.getStats();
      expect(stats.totalEvents).toBe(0);
    });
  });

  // ── Full E2E Flow ─────────────────────────────────────────

  describe("Full E2E: Architect → Router → Sentinel → Reactions", () => {
    it("should execute the complete pipeline flow", async () => {
      // 1. Perception: Architect analyzes
      const architectAdapter = new ArchitectAdapter(eventBus);
      const architectModule = {
        analyze: async () => createMockArchitectReport(),
      };
      const snapshot = await architectAdapter.analyze("/test/project", architectModule);

      expect(snapshot.projectName).toBe("test-project");
      expect(snapshot.score.overall).toBe(72);

      // 2. Reasoning: Router maps findings to skills
      const router = new ToolkitRouter(eventBus);
      const guidance = await router.route(snapshot);

      expect(guidance.length).toBeGreaterThan(0);
      const totalFindings = guidance.reduce((s, g) => s + g.findings.length, 0);
      const totalRecs = guidance.reduce((s, g) => s + g.recommendations.length, 0);
      expect(totalFindings).toBeGreaterThan(0);

      // 3. Validation: Sentinel validates
      const sentinelAdapter = new SentinelAdapter(eventBus);
      const sentinelModule = {
        validate: async () => createMockSentinelResult(),
      };
      const validation = await sentinelAdapter.validate("/test/project", undefined, sentinelModule);

      expect(validation.overallScore).toBeGreaterThan(0);
      expect(validation.validators.length).toBe(3);

      // 4. Reactions: Engine responds to events
      const reactions: string[] = [];
      const executor: ActionExecutor = {
        execute: async (action, event, _ctx) => {
          reactions.push(`${action}:${event.type}`);
          return "OK";
        },
      };
      const engine = new ReactionEngine(executor, []);

      // Simulate cross-layer insight event
      await engine.processEvent(makeEvent({
        type: "pipeline.completed",
        metadata: {
          healthScore: Math.round((snapshot.score.overall + validation.overallScore) / 2),
          architectScore: snapshot.score.overall,
          validationScore: validation.overallScore,
          skillsActivated: guidance.length,
          totalFindings,
          totalRecs,
        },
      }));

      // Verify the flow produced meaningful results
      expect(snapshot.antiPatterns.length).toBe(2);
      // design-patterns should be triggered by god_class anti-pattern
      const dpSkill = guidance.find((g) => g.skillName === "design-patterns");
      expect(dpSkill).toBeDefined();
      expect(validation.issueCount.total).toBe(3);
    });
  });
});
