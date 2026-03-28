/**
 * @camilooscargbaptista/nexus-core — Health Supervisor + Stress Detector + Health Report Tests
 */

import { describe, it, expect } from "@jest/globals";
import { HealthSupervisor } from "../health-supervisor.js";
import { StressDetector } from "../stress-detector.js";
import { HealthReportGenerator } from "../health-report.js";
import type { CodebaseMetrics } from "../health-supervisor.js";

// ═══════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════

const healthyMetrics: CodebaseMetrics = {
  todoCount: 5,
  fixmeCount: 2,
  totalFiles: 100,
  largeFiles: 1,
  avgComplexity: 5,
  testCoverage: 85,
  archScore: 82,
  circularDeps: 0,
  staleDependencies: 2,
  deadCodePercent: 3,
};

const unhealthyMetrics: CodebaseMetrics = {
  todoCount: 40,
  fixmeCount: 15,
  totalFiles: 200,
  largeFiles: 12,
  avgComplexity: 18,
  testCoverage: 40,
  archScore: 45,
  circularDeps: 5,
  staleDependencies: 15,
  deadCodePercent: 25,
};

// ═══════════════════════════════════════════════════════════════
// HEALTH SUPERVISOR
// ═══════════════════════════════════════════════════════════════

describe("HealthSupervisor", () => {
  it("should analyze healthy codebase", () => {
    const supervisor = new HealthSupervisor();
    const snapshot = supervisor.analyze(healthyMetrics);

    expect(snapshot.overallStatus).toBe("healthy");
    expect(snapshot.signals.length).toBe(8);
    expect(snapshot.overallScore).toBeGreaterThan(50);
  });

  it("should detect critical codebase", () => {
    const supervisor = new HealthSupervisor();
    const snapshot = supervisor.analyze(unhealthyMetrics);

    expect(snapshot.overallStatus).toBe("critical");
    const criticals = snapshot.signals.filter((s) => s.severity === "critical");
    expect(criticals.length).toBeGreaterThan(0);
  });

  it("should track trends across snapshots", () => {
    const supervisor = new HealthSupervisor();

    // First snapshot — baseline
    supervisor.analyze(healthyMetrics);

    // Second snapshot — degraded
    const degraded = supervisor.analyze({
      ...healthyMetrics,
      todoCount: 30,
      fixmeCount: 10,
      testCoverage: 60,
    });

    expect(degraded.degradations.length).toBeGreaterThan(0);
  });

  it("should detect improvements", () => {
    const supervisor = new HealthSupervisor();

    // Start bad
    supervisor.analyze(unhealthyMetrics);

    // Improve
    const improved = supervisor.analyze(healthyMetrics);

    expect(improved.improvements.length).toBeGreaterThan(0);
  });

  it("should return velocity", () => {
    const supervisor = new HealthSupervisor();

    expect(supervisor.getVelocity()).toBe("unknown");

    supervisor.analyze(unhealthyMetrics);
    supervisor.analyze(healthyMetrics);

    const velocity = supervisor.getVelocity();
    expect(["improving", "stable", "degrading"]).toContain(velocity);
  });

  it("should track snapshot count", () => {
    const supervisor = new HealthSupervisor();
    expect(supervisor.snapshotCount).toBe(0);

    supervisor.analyze(healthyMetrics);
    expect(supervisor.snapshotCount).toBe(1);

    supervisor.analyze(unhealthyMetrics);
    expect(supervisor.snapshotCount).toBe(2);
  });

  it("should support custom thresholds", () => {
    const strict = new HealthSupervisor({ maxTodos: 1, minTestCoverage: 95 });
    const snapshot = strict.analyze(healthyMetrics);

    // With strict thresholds, even healthy metrics trigger warnings
    const warnings = snapshot.signals.filter((s) => s.severity === "warning" || s.severity === "critical");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// STRESS DETECTOR
// ═══════════════════════════════════════════════════════════════

describe("StressDetector", () => {
  const detector = new StressDetector();

  it("should detect clean code", () => {
    const report = detector.analyze([
      { content: "const add = (a: number, b: number): number => a + b;", filePath: "clean.ts" },
    ]);

    expect(report.stressScore).toBeLessThan(50);
    expect(report.stressLevel).toBe("low");
  });

  it("should detect TODO/FIXME markers", () => {
    const report = detector.analyze([
      { content: "// TODO: fix this\n// FIXME: broken\n// HACK: workaround\n// TODO: later", filePath: "messy.ts" },
    ]);

    const todos = report.indicators.find((i) => i.id === "todo");
    expect(todos).toBeDefined();
    expect(todos!.count).toBe(2);

    const fixmes = report.indicators.find((i) => i.id === "fixme");
    expect(fixmes).toBeDefined();
  });

  it("should detect code smells", () => {
    const report = detector.analyze([
      { content: "const x: any = {};\nconsole.log(x);\nconst y: any = 1;", filePath: "smelly.ts" },
    ]);

    const anyType = report.indicators.find((i) => i.id === "any-type");
    expect(anyType).toBeDefined();
    expect(anyType!.count).toBe(2);
  });

  it("should detect anti-patterns", () => {
    const report = detector.analyze([
      { content: "eval('alert(1)');\neval('dangerous');", filePath: "danger.ts" },
    ]);

    const evalUsage = report.indicators.find((i) => i.id === "eval-usage");
    expect(evalUsage).toBeDefined();
    expect(evalUsage!.severity).toBe("critical");
  });

  it("should identify hotspots", () => {
    const report = detector.analyze([
      { content: "// TODO\n// FIXME\n// HACK\n// WTF\n// XXX\neval('x')", filePath: "hotspot.ts" },
      { content: "const clean = true;", filePath: "clean.ts" },
    ]);

    expect(report.hotspots[0]).toBe("hotspot.ts");
  });

  it("should generate recommendations", () => {
    const report = detector.analyze([
      { content: "eval('x');\n// TODO\n// FIXME\n// HACK\nconsole.log('debug');", filePath: "bad.ts" },
    ]);

    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("should merge indicators across files", () => {
    const report = detector.analyze([
      { content: "// TODO: file1", filePath: "a.ts" },
      { content: "// TODO: file2\n// TODO: file2b", filePath: "b.ts" },
    ]);

    const todos = report.indicators.find((i) => i.id === "todo");
    expect(todos!.count).toBe(3);
    expect(todos!.locations).toContain("a.ts");
    expect(todos!.locations).toContain("b.ts");
  });

  it("should show healthy message for clean code", () => {
    const report = detector.analyze([
      { content: "const x = 1;", filePath: "clean.ts" },
    ]);

    expect(report.recommendations.some((r) => r.includes("healthy"))).toBe(true);
  });

  it("should detect tech debt patterns", () => {
    const report = detector.analyze([
      { content: "// @deprecated\n// TEMPORARY fix\nconst url = 'http://localhost:3000';", filePath: "debt.ts" },
    ]);

    const deprecated = report.indicators.find((i) => i.id === "deprecated");
    expect(deprecated).toBeDefined();

    const temp = report.indicators.find((i) => i.id === "temp-code");
    expect(temp).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// HEALTH REPORT
// ═══════════════════════════════════════════════════════════════

describe("HealthReportGenerator", () => {
  it("should generate complete report", () => {
    const supervisor = new HealthSupervisor();
    const detector = new StressDetector();

    const health = supervisor.analyze(healthyMetrics);
    const stress = detector.analyze([
      { content: "// TODO: cleanup\nconst x: any = 1;", filePath: "test.ts" },
    ]);

    const report = HealthReportGenerator.generate(health, stress);

    expect(report).toContain("Health Report");
    expect(report).toContain("Health Signals");
    expect(report).toContain("🟢");
  });

  it("should generate report without stress section", () => {
    const supervisor = new HealthSupervisor();
    const health = supervisor.analyze(healthyMetrics);

    const report = HealthReportGenerator.generate(health, undefined, {
      includeStress: false,
    });

    expect(report).toContain("Health Signals");
    expect(report).not.toContain("Stress Analysis");
  });

  it("should include trends when available", () => {
    const supervisor = new HealthSupervisor();
    supervisor.analyze(healthyMetrics);
    const degraded = supervisor.analyze({
      ...healthyMetrics,
      todoCount: 35,
      fixmeCount: 15,
    });

    const report = HealthReportGenerator.generate(degraded);

    // Should contain trends section if there are degradations
    if (degraded.degradations.length > 0) {
      expect(report).toContain("Trends");
    }
  });

  it("should support custom title", () => {
    const supervisor = new HealthSupervisor();
    const health = supervisor.analyze(healthyMetrics);

    const report = HealthReportGenerator.generate(health, undefined, {
      title: "Nexus Weekly Health",
    });

    expect(report).toContain("Nexus Weekly Health");
  });
});
