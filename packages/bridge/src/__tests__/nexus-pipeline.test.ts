/**
 * Nexus Pipeline — End-to-end integration test
 *
 * Validates the full closed loop:
 *   Architect (mock) → Toolkit Router → Sentinel (mock) → Insights
 *
 * Uses mock adapters to test the pipeline logic without
 * requiring actual @girardelli/architect or sentinel-method packages.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { NexusEventBus } from "@camilooscargbaptista/nexus-events";
import { ArchitectAdapter, type ArchitectAnalysisReport } from "../architect-adapter.js";
import { SentinelAdapter, type SentinelValidationResult } from "../sentinel-adapter.js";
import { ToolkitRouter } from "../toolkit-router.js";
import type {
  NexusEvent,
  ArchitectureSnapshot,
  GuidanceResult,
  ValidationSnapshot,
  NexusEventType,
} from "@camilooscargbaptista/nexus-types";

// ─── Mock Data ───

const MOCK_ARCHITECT_REPORT: ArchitectAnalysisReport = {
  projectInfo: {
    name: "test-project",
    path: "/test/project",
    files: 42,
    lines: 8500,
    frameworks: ["nestjs", "typescript", "jest"],
    domain: "fintech",
  },
  score: {
    overall: 62,
    breakdown: {
      modularity: 70,
      coupling: 45, // Low coupling score → triggers skills
      cohesion: 65,
      layering: 68,
    },
  },
  layers: [
    { name: "controllers", type: "api", files: ["src/controllers/auth.ts", "src/controllers/payment.ts"] },
    { name: "services", type: "service", files: ["src/services/auth.service.ts", "src/services/payment.service.ts"] },
    { name: "repositories", type: "data", files: ["src/repositories/user.repo.ts"] },
    { name: "models", type: "data", files: ["src/models/user.ts", "src/models/transaction.ts"] },
  ],
  antiPatterns: [
    {
      name: "god_class",
      severity: "high",
      location: "src/services/payment.service.ts",
      description: "PaymentService has 850 lines and handles 12 responsibilities",
      files: ["src/services/payment.service.ts"],
      suggestion: "Extract payment processing, refund handling, and reporting into separate services",
    },
    {
      name: "circular_dependency",
      severity: "critical",
      location: "src/services/",
      description: "Circular dependency between AuthService and PaymentService",
      files: ["src/services/auth.service.ts", "src/services/payment.service.ts"],
      suggestion: "Introduce a shared interface or event-based communication",
    },
    {
      name: "hardcoded_secret",
      severity: "critical",
      location: "src/config/database.ts",
      description: "Database password hardcoded in configuration file",
      files: ["src/config/database.ts"],
      suggestion: "Use environment variables or a secrets manager",
    },
  ],
  dependencies: [
    { source: "auth.controller", target: "auth.service", type: "import", weight: 1 },
    { source: "auth.service", target: "payment.service", type: "import", weight: 1 },
    { source: "payment.service", target: "auth.service", type: "import", weight: 1 }, // Circular!
    { source: "payment.service", target: "user.repo", type: "import", weight: 1 },
  ],
};

const MOCK_SENTINEL_RESULT: SentinelValidationResult = {
  success: false,
  timestamp: new Date().toISOString(),
  sourceDirectory: "/test/project",
  duration: 2500,
  summary: {
    totalFiles: 42,
    passedChecks: 4,
    failedChecks: 3,
    warnings: 8,
  },
  results: [
    {
      validator: "SecurityValidator",
      passed: false,
      score: 45,
      threshold: 70,
      issues: [
        { severity: "error", code: "SEC-001", message: "Hardcoded database credentials", file: "src/config/database.ts", line: 15, suggestion: "Use environment variables" },
        { severity: "error", code: "SEC-003", message: "SQL injection vulnerability", file: "src/repositories/user.repo.ts", line: 42, suggestion: "Use parameterized queries" },
        { severity: "warning", code: "SEC-005", message: "Missing rate limiting on auth endpoint", file: "src/controllers/auth.ts", line: 8 },
      ],
      details: { cwesMapped: ["CWE-798", "CWE-89"] },
    },
    {
      validator: "TestingValidator",
      passed: false,
      score: 35,
      threshold: 70,
      issues: [
        { severity: "warning", code: "TEST-001", message: "Low test coverage: 35%", suggestion: "Add unit tests for services and repositories" },
        { severity: "warning", code: "TEST-003", message: "No integration tests found" },
      ],
      details: { coverage: 35, testFiles: 3, totalFiles: 42 },
    },
    {
      validator: "PerformanceValidator",
      passed: true,
      score: 72,
      threshold: 60,
      issues: [
        { severity: "info", code: "PERF-002", message: "Consider adding database connection pooling" },
      ],
      details: { avgComplexity: 12 },
    },
    {
      validator: "MaintainabilityValidator",
      passed: true,
      score: 65,
      threshold: 60,
      issues: [
        { severity: "warning", code: "MAINT-001", message: "Function exceeds 50 lines", file: "src/services/payment.service.ts", line: 120 },
      ],
      details: { maintainabilityIndex: 65 },
    },
    {
      validator: "DependencyValidator",
      passed: true,
      score: 80,
      threshold: 70,
      issues: [],
      details: { unusedDeps: 0, outdatedDeps: 2 },
    },
    {
      validator: "DocumentationValidator",
      passed: false,
      score: 40,
      threshold: 60,
      issues: [
        { severity: "warning", code: "DOC-001", message: "Missing JSDoc on 15 exported functions" },
        { severity: "info", code: "DOC-002", message: "No CHANGELOG.md found" },
      ],
      details: { jsdocCoverage: 25 },
    },
    {
      validator: "CodeStyleValidator",
      passed: true,
      score: 88,
      threshold: 70,
      issues: [],
      details: {},
    },
  ],
  exitCode: 1,
};

// ─── Tests ───

describe("NexusPipeline Integration", () => {
  let eventBus: NexusEventBus;
  let architectAdapter: ArchitectAdapter;
  let sentinelAdapter: SentinelAdapter;
  let toolkitRouter: ToolkitRouter;
  let capturedEvents: NexusEvent[];

  beforeEach(() => {
    eventBus = new NexusEventBus();
    architectAdapter = new ArchitectAdapter(eventBus);
    sentinelAdapter = new SentinelAdapter(eventBus);
    toolkitRouter = new ToolkitRouter(eventBus);
    capturedEvents = [];

    // Capture all events
    eventBus.on("*", (event) => {
      capturedEvents.push(event);
    });
  });

  describe("ArchitectAdapter", () => {
    it("should transform Architect report into ArchitectureSnapshot", async () => {
      const mockModule = {
        analyze: async () => MOCK_ARCHITECT_REPORT,
      };

      const snapshot = await architectAdapter.analyze("/test/project", mockModule);

      expect(snapshot.projectName).toBe("test-project");
      expect(snapshot.score.overall).toBe(62);
      expect(snapshot.score.coupling).toBe(45);
      expect(snapshot.antiPatterns).toHaveLength(3);
      expect(snapshot.layers).toHaveLength(4);
      expect(snapshot.domain).toBe("fintech");
      expect(snapshot.frameworks).toContain("nestjs");
    });

    it("should emit architecture.analyzed event", async () => {
      const mockModule = { analyze: async () => MOCK_ARCHITECT_REPORT };
      await architectAdapter.analyze("/test/project", mockModule);

      const analysisEvents = capturedEvents.filter(
        (e) => e.type === ("architecture.analyzed" as NexusEventType)
      );
      expect(analysisEvents).toHaveLength(1);
    });

    it("should emit anti_pattern.detected for critical/high findings", async () => {
      const mockModule = { analyze: async () => MOCK_ARCHITECT_REPORT };
      await architectAdapter.analyze("/test/project", mockModule);

      const patternEvents = capturedEvents.filter(
        (e) => e.type === ("anti_pattern.detected" as NexusEventType)
      );
      // god_class (high) + circular_dependency (critical) + hardcoded_secret (critical) = 3
      expect(patternEvents).toHaveLength(3);
    });
  });

  describe("ToolkitRouter", () => {
    let snapshot: ArchitectureSnapshot;

    beforeEach(async () => {
      const mockModule = { analyze: async () => MOCK_ARCHITECT_REPORT };
      snapshot = await architectAdapter.analyze("/test/project", mockModule);
      capturedEvents = []; // Reset for router tests
    });

    it("should route anti-patterns to relevant skills", async () => {
      const results = await toolkitRouter.route(snapshot);

      const skillNames = results.map((r) => r.skillName);

      // god_class should trigger design-patterns and domain-modeling
      expect(skillNames).toContain("design-patterns");

      // circular_dependency should trigger adr
      expect(skillNames).toContain("adr");

      // hardcoded_secret should trigger security-review
      expect(skillNames).toContain("security-review");

      // NestJS framework should trigger backend-review
      expect(skillNames).toContain("backend-review");

      // fintech domain should trigger compliance-review
      expect(skillNames).toContain("compliance-review");
    });

    it("should route based on score thresholds", async () => {
      const results = await toolkitRouter.route(snapshot);
      const skillNames = results.map((r) => r.skillName);

      // coupling < 50 should trigger design-patterns
      // overall < 70 should trigger testing-strategy
      expect(skillNames).toContain("testing-strategy");
    });

    it("should generate findings and recommendations", async () => {
      const results = await toolkitRouter.route(snapshot);
      const totalFindings = results.reduce((s, r) => s + r.findings.length, 0);
      const totalRecs = results.reduce((s, r) => s + r.recommendations.length, 0);

      expect(totalFindings).toBeGreaterThan(0);
      expect(totalRecs).toBeGreaterThan(0);
    });

    it("should emit skill.triggered events", async () => {
      await toolkitRouter.route(snapshot);

      const skillEvents = capturedEvents.filter(
        (e) => e.type === ("skill.triggered" as NexusEventType)
      );
      expect(skillEvents.length).toBeGreaterThan(0);
    });

    it("should emit guidance.generated event", async () => {
      await toolkitRouter.route(snapshot);

      const guidanceEvents = capturedEvents.filter(
        (e) => e.type === ("guidance.generated" as NexusEventType)
      );
      expect(guidanceEvents).toHaveLength(1);
    });
  });

  describe("SentinelAdapter", () => {
    it("should transform Sentinel result into ValidationSnapshot", async () => {
      const mockModule = {
        validate: async () => MOCK_SENTINEL_RESULT,
      };

      const snapshot = await sentinelAdapter.validate("/test/project", undefined, mockModule);

      expect(snapshot.success).toBe(false);
      expect(snapshot.validators).toHaveLength(7);
      expect(snapshot.issueCount.total).toBeGreaterThan(0);
      expect(snapshot.overallScore).toBeGreaterThan(0);
    });

    it("should emit validation.completed and quality_gate events", async () => {
      const mockModule = { validate: async () => MOCK_SENTINEL_RESULT };
      await sentinelAdapter.validate("/test/project", undefined, mockModule);

      const completedEvents = capturedEvents.filter(
        (e) => e.type === ("validation.completed" as NexusEventType)
      );
      const gateEvents = capturedEvents.filter(
        (e) =>
          e.type === ("quality_gate.passed" as NexusEventType) ||
          e.type === ("quality_gate.failed" as NexusEventType)
      );

      expect(completedEvents).toHaveLength(1);
      expect(gateEvents).toHaveLength(1);
      // Should be failed since MOCK_SENTINEL_RESULT.success = false
      expect(gateEvents[0]!.type).toBe("quality_gate.failed");
    });
  });

  describe("Full Pipeline (Perception → Reasoning → Validation)", () => {
    it("should execute the complete closed loop", async () => {
      // 1. Perception
      const mockArchitect = { analyze: async () => MOCK_ARCHITECT_REPORT };
      const snapshot = await architectAdapter.analyze("/test/project", mockArchitect);

      // 2. Reasoning
      const guidance = await toolkitRouter.route(snapshot);

      // 3. Validation
      const mockSentinel = { validate: async () => MOCK_SENTINEL_RESULT };
      const validation = await sentinelAdapter.validate("/test/project", undefined, mockSentinel);

      // Verify the loop produced meaningful output
      expect(snapshot.score.overall).toBe(62);
      expect(guidance.length).toBeGreaterThan(3); // Multiple skills activated
      expect(validation.issueCount.total).toBeGreaterThan(0);

      // Verify event flow
      const eventTypes = capturedEvents.map((e) => e.type);
      expect(eventTypes).toContain("architecture.analyzed");
      expect(eventTypes).toContain("anti_pattern.detected");
      expect(eventTypes).toContain("score.calculated");
      expect(eventTypes).toContain("skill.triggered");
      expect(eventTypes).toContain("guidance.generated");
      expect(eventTypes).toContain("validation.completed");
      expect(eventTypes).toContain("quality_gate.failed");
    });

    it("should correlate findings across layers", async () => {
      // Architect detects hardcoded_secret
      const mockArchitect = { analyze: async () => MOCK_ARCHITECT_REPORT };
      const snapshot = await architectAdapter.analyze("/test/project", mockArchitect);

      // Router activates security-review skill
      const guidance = await toolkitRouter.route(snapshot);
      const securityGuidance = guidance.find((g) => g.skillName === "security-review");
      expect(securityGuidance).toBeDefined();
      expect(securityGuidance!.findings.some((f) => f.title.includes("hardcoded_secret"))).toBe(true);

      // Sentinel also detects the same issue
      const mockSentinel = { validate: async () => MOCK_SENTINEL_RESULT };
      const validation = await sentinelAdapter.validate("/test/project", undefined, mockSentinel);
      const securityValidator = validation.validators.find((v) => v.name === "SecurityValidator");
      expect(securityValidator).toBeDefined();
      expect(securityValidator!.passed).toBe(false);
      expect(securityValidator!.topIssues.some((i) => i.message.includes("credentials"))).toBe(true);

      // Both layers independently flagged the same underlying problem
      console.log("\n--- Cross-Layer Correlation ---");
      console.log(`Architect: hardcoded_secret (critical) in ${snapshot.antiPatterns.find((a) => a.pattern === "hardcoded_secret")?.location}`);
      console.log(`Toolkit: ${securityGuidance!.findings.length} security findings, ${securityGuidance!.recommendations.length} recommendations`);
      console.log(`Sentinel: SecurityValidator score ${securityValidator!.score}/100 with ${securityValidator!.issueCount} issues`);
    });
  });

  describe("EventBus", () => {
    it("should maintain event log with correlation IDs", async () => {
      const mockArchitect = { analyze: async () => MOCK_ARCHITECT_REPORT };
      await architectAdapter.analyze("/test/project", mockArchitect);

      // All events from one analyze() call should share a correlation ID
      const correlationIds = new Set(capturedEvents.map((e) => e.correlationId));
      expect(correlationIds.size).toBe(1); // All events from one pipeline share correlation

      // Event log should be queryable
      const log = eventBus.getLog({ type: "architecture.analyzed" as NexusEventType });
      expect(log).toHaveLength(1);
    });

    it("should support event filtering", async () => {
      const criticalOnly: NexusEvent[] = [];
      eventBus.on("anti_pattern.detected" as NexusEventType, (event) => {
        criticalOnly.push(event);
      }, {
        filter: (e) => (e.payload as any)?.severity === "critical",
      });

      const mockArchitect = { analyze: async () => MOCK_ARCHITECT_REPORT };
      await architectAdapter.analyze("/test/project", mockArchitect);

      // Only critical anti-patterns: circular_dependency + hardcoded_secret
      expect(criticalOnly).toHaveLength(2);
    });
  });
});
