/**
 * @nexus/bridge — Pipeline Orchestrator Tests (Sprint 11 — FINAL)
 */

import { describe, it, expect } from "@jest/globals";
import { ExecutionPlan } from "../execution-plan.js";
import { PipelineOrchestrator } from "../pipeline-orchestrator.js";
import { PipelineReportGenerator } from "../pipeline-report.js";

// ═══════════════════════════════════════════════════════════════
// EXECUTION PLAN
// ═══════════════════════════════════════════════════════════════

describe("ExecutionPlan", () => {
  it("should add and track steps", () => {
    const plan = new ExecutionPlan();
    plan.addStep({ id: "s1", name: "Step One", action: "analyze" });
    plan.addStep({ id: "s2", name: "Step Two", action: "classify" });

    expect(plan.stepCount).toBe(2);
    expect(plan.progress).toBe(0);
  });

  it("should return next pending step", () => {
    const plan = new ExecutionPlan();
    plan.addStep({ id: "s1", name: "Analyze", action: "analyze" });
    plan.addStep({ id: "s2", name: "Classify", action: "classify" });

    const next = plan.nextStep();
    expect(next!.id).toBe("s1");
  });

  it("should respect dependencies", () => {
    const plan = new ExecutionPlan();
    plan.addStep({ id: "s1", name: "Analyze", action: "analyze" });
    plan.addStep({ id: "s2", name: "Classify", action: "classify", dependsOn: ["s1"] });

    // s2 depends on s1, so nextStep should return s1 first
    expect(plan.nextStep()!.id).toBe("s1");

    plan.start("s1");
    plan.complete("s1", { score: 85 });

    // Now s2 is available
    expect(plan.nextStep()!.id).toBe("s2");
  });

  it("should skip steps with failed dependencies", () => {
    const plan = new ExecutionPlan();
    plan.addStep({ id: "s1", name: "Analyze", action: "analyze" });
    plan.addStep({ id: "s2", name: "Route", action: "route", dependsOn: ["s1"] });

    plan.start("s1");
    plan.fail("s1", "Analysis failed");

    // s2 should be skipped
    expect(plan.nextStep()).toBeUndefined();
  });

  it("should track progress", () => {
    const plan = new ExecutionPlan();
    plan.addStep({ id: "s1", name: "A", action: "analyze" });
    plan.addStep({ id: "s2", name: "B", action: "classify" });

    plan.start("s1");
    plan.complete("s1");
    expect(plan.progress).toBe(50);

    plan.start("s2");
    plan.complete("s2");
    expect(plan.progress).toBe(100);
    expect(plan.isComplete).toBe(true);
  });

  it("should support failFast mode", () => {
    const plan = new ExecutionPlan({ failFast: true });
    plan.addStep({ id: "s1", name: "A", action: "analyze" });
    plan.addStep({ id: "s2", name: "B", action: "classify" });

    plan.start("s1");
    plan.fail("s1", "Boom");

    // failFast: nextStep should return undefined
    expect(plan.nextStep()).toBeUndefined();
    expect(plan.hasFailed).toBe(true);
  });

  it("should return 100% progress for empty plan", () => {
    const plan = new ExecutionPlan();
    expect(plan.progress).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

describe("PipelineOrchestrator", () => {
  it("should execute a simple pipeline", async () => {
    const orchestrator = new PipelineOrchestrator();

    orchestrator.registerHandler("analyze", {
      execute: async (input) => ({ score: 85, query: input }),
    });

    orchestrator.registerHandler("classify", {
      execute: async () => ({ intent: "security", confidence: 0.9 }),
    });

    const result = await orchestrator.run("Fix XSS", [
      { id: "s1", name: "Analyze", action: "analyze" },
      { id: "s2", name: "Classify", action: "classify", dependsOn: ["s1"] },
    ]);

    expect(result.status).toBe("success");
    expect(result.progress).toBe(100);
    expect(result.steps.length).toBe(2);
  });

  it("should pass results between steps", async () => {
    const orchestrator = new PipelineOrchestrator();

    orchestrator.registerHandler("analyze", {
      execute: async () => ({ score: 90 }),
    });

    orchestrator.registerHandler("report", {
      execute: async (input) => ({ analysis: input }),
    });

    const result = await orchestrator.run("Test", [
      { id: "s1", name: "Analyze", action: "analyze" },
      { id: "s2", name: "Report", action: "report", dependsOn: ["s1"] },
    ]);

    expect(result.status).toBe("success");
    const reportResult = result.finalResult as { analysis: { score: number } };
    expect(reportResult.analysis.score).toBe(90);
  });

  it("should handle failures gracefully", async () => {
    const orchestrator = new PipelineOrchestrator();

    orchestrator.registerHandler("analyze", {
      execute: async () => { throw new Error("Boom!"); },
    });

    orchestrator.registerHandler("report", {
      execute: async () => ({ done: true }),
    });

    const result = await orchestrator.run("Test", [
      { id: "s1", name: "Analyze", action: "analyze" },
      { id: "s2", name: "Report", action: "report" },
    ]);

    expect(result.status).toBe("partial");
    expect(result.steps.find((s) => s.id === "s1")!.status).toBe("failed");
    expect(result.steps.find((s) => s.id === "s2")!.status).toBe("completed");
  });

  it("should fail if no handler registered", async () => {
    const orchestrator = new PipelineOrchestrator();

    const result = await orchestrator.run("Test", [
      { id: "s1", name: "Unknown", action: "nonexistent" },
    ]);

    expect(result.status).toBe("failed");
    expect(result.steps[0]!.error).toContain("No handler");
  });

  it("should track handler count", () => {
    const orchestrator = new PipelineOrchestrator();
    expect(orchestrator.handlerCount).toBe(0);

    orchestrator.registerHandler("analyze", { execute: async () => null });
    expect(orchestrator.handlerCount).toBe(1);
    expect(orchestrator.registeredActions).toContain("analyze");
  });

  it("should support multi-dependency input merge", async () => {
    const orchestrator = new PipelineOrchestrator();

    orchestrator.registerHandler("analyze", {
      execute: async () => ({ score: 85 }),
    });

    orchestrator.registerHandler("classify", {
      execute: async () => ({ intent: "security" }),
    });

    orchestrator.registerHandler("merge", {
      execute: async (input) => ({ merged: input }),
    });

    const result = await orchestrator.run("Test", [
      { id: "s1", name: "Analyze", action: "analyze" },
      { id: "s2", name: "Classify", action: "classify" },
      { id: "s3", name: "Merge", action: "merge", dependsOn: ["s1", "s2"] },
    ]);

    expect(result.status).toBe("success");
    const mergeResult = result.finalResult as { merged: Record<string, unknown> };
    expect(mergeResult.merged).toHaveProperty("s1");
    expect(mergeResult.merged).toHaveProperty("s2");
  });
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE REPORT
// ═══════════════════════════════════════════════════════════════

describe("PipelineReportGenerator", () => {
  it("should generate report from pipeline result", () => {
    const result = {
      query: "Fix vulnerability",
      steps: [
        { id: "s1", name: "Analyze", action: "analyze" as const, status: "completed" as const },
        { id: "s2", name: "Route", action: "route" as const, status: "completed" as const },
      ],
      finalResult: { score: 85 },
      durationMs: 150,
      status: "success" as const,
      progress: 100,
    };

    const report = PipelineReportGenerator.generate(result);

    expect(report).toContain("Pipeline Execution Report");
    expect(report).toContain("Fix vulnerability");
    expect(report).toContain("✅");
    expect(report).toContain("100%");
  });

  it("should show failed steps", () => {
    const result = {
      query: "Test",
      steps: [
        { id: "s1", name: "Analyze", action: "analyze" as const, status: "failed" as const, error: "Boom" },
      ],
      finalResult: null,
      durationMs: 50,
      status: "failed" as const,
      progress: 0,
    };

    const report = PipelineReportGenerator.generate(result);
    expect(report).toContain("❌");
  });

  it("should support custom title", () => {
    const result = {
      query: "Q",
      steps: [],
      finalResult: null,
      durationMs: 0,
      status: "success" as const,
      progress: 100,
    };

    const report = PipelineReportGenerator.generate(result, { title: "Nexus Run #42" });
    expect(report).toContain("Nexus Run #42");
  });
});
