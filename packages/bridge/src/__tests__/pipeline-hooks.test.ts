/**
 * Tests for Pipeline Hook System
 */

import {
  PipelineHookManager,
  createTimingHook,
  createFindingThresholdHook,
  createScoreGateHook,
} from "../pipeline-hooks.js";
import type { HookContext, HookDecision } from "../pipeline-hooks.js";
import type { ArchitectureSnapshot, GuidanceFinding, Severity } from "@camilooscargbaptista/nexus-types";

// ─── Helpers ──────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ArchitectureSnapshot> = {}): ArchitectureSnapshot {
  return {
    projectPath: "/test",
    projectName: "test-project",
    timestamp: new Date().toISOString(),
    score: { overall: 75, modularity: 80, coupling: 70, cohesion: 75, layering: 75 },
    layers: [],
    antiPatterns: [],
    dependencies: [],
    frameworks: [],
    domain: "saas" as any,
    fileCount: 100,
    lineCount: 10000,
    ...overrides,
  };
}

function makeFinding(id: string, severity: string): GuidanceFinding {
  return {
    id,
    severity: severity as Severity,
    title: `Finding ${id}`,
    description: `Description for ${id}`,
    skillSource: "test-skill",
    affectedFiles: ["test.ts"],
  };
}

function makeContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    pipeline: "test-pipeline",
    stepIndex: 0,
    stepName: "security-review",
    snapshot: makeSnapshot(),
    accumulatedFindings: [],
    totalSteps: 3,
    startedAt: Date.now(),
    metadata: new Map(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe("PipelineHookManager", () => {
  let manager: PipelineHookManager;

  beforeEach(() => {
    manager = new PipelineHookManager();
  });

  test("registers and counts hooks", () => {
    manager.register("pre-step", () => ({ action: "continue" }));
    manager.register("post-step", () => ({ action: "continue" }));
    expect(manager.hookCount).toBe(2);
  });

  test("unregisters hooks by ID", () => {
    const id = manager.register("pre-step", () => ({ action: "continue" }));
    expect(manager.hookCount).toBe(1);
    manager.unregister(id);
    expect(manager.hookCount).toBe(0);
  });

  test("executes hooks in priority order", async () => {
    const order: number[] = [];
    manager.register("pre-step", () => { order.push(1); return { action: "continue" }; }, { priority: 10 });
    manager.register("pre-step", () => { order.push(2); return { action: "continue" }; }, { priority: 20 });
    manager.register("pre-step", () => { order.push(3); return { action: "continue" }; }, { priority: 5 });

    await manager.execute("pre-step", makeContext());
    expect(order).toEqual([2, 1, 3]); // highest priority first
  });

  test("returns continue when no hooks match", async () => {
    const decision = await manager.execute("pre-step", makeContext());
    expect(decision.action).toBe("continue");
  });

  test("abort decision wins over all others", async () => {
    manager.register("pre-step", () => ({ action: "continue" }), { priority: 10 });
    manager.register("pre-step", () => ({ action: "abort", reason: "critical failure" }), { priority: 20 });

    const decision = await manager.execute("pre-step", makeContext());
    expect(decision.action).toBe("abort");
    expect(decision.reason).toBe("critical failure");
  });

  test("skip decision wins over continue", async () => {
    manager.register("pre-step", () => ({ action: "continue" }), { priority: 20 });
    manager.register("pre-step", () => ({ action: "skip", reason: "not needed" }), { priority: 10 });

    const decision = await manager.execute("pre-step", makeContext());
    expect(decision.action).toBe("skip");
  });

  test("retry decision wins over continue", async () => {
    manager.register("pre-step", () => ({ action: "continue" }), { priority: 10 });
    manager.register("pre-step", () => ({ action: "retry", reason: "transient error" }), { priority: 5 });

    const decision = await manager.execute("pre-step", makeContext());
    expect(decision.action).toBe("retry");
  });

  test("filters by skill name", async () => {
    const called: string[] = [];
    manager.register("pre-step", () => { called.push("security"); return { action: "continue" }; }, {
      skillFilter: ["security-review"],
    });
    manager.register("pre-step", () => { called.push("all"); return { action: "continue" }; });

    await manager.execute("pre-step", makeContext({ stepName: "security-review" }));
    expect(called).toEqual(["security", "all"]); // both match, security registered first but priority same (0), sorted by insertion

    called.length = 0;
    await manager.execute("pre-step", makeContext({ stepName: "performance" }));
    expect(called).toEqual(["all"]); // only "all" matches
  });

  test("disabled hooks are skipped", async () => {
    const id = manager.register("pre-step", () => ({ action: "abort" }));
    manager.setEnabled(id, false);

    const decision = await manager.execute("pre-step", makeContext());
    expect(decision.action).toBe("continue");
  });

  test("handles hook errors gracefully", async () => {
    manager.register("pre-step", () => {
      throw new Error("hook crashed");
    });

    const decision = await manager.execute("pre-step", makeContext());
    expect(decision.action).toBe("continue"); // error = continue
  });

  test("records execution log", async () => {
    manager.register("pre-step", () => ({ action: "continue" }), { name: "timing" });
    await manager.execute("pre-step", makeContext());

    const log = manager.getExecutionLog();
    expect(log).toHaveLength(1);
    expect(log[0].hookName).toBe("timing");
    expect(log[0].phase).toBe("pre-step");
    expect(log[0].decision.action).toBe("continue");
  });

  test("post-step hooks can modify findings", async () => {
    const modifiedFindings = [makeFinding("new-1", "high")];
    manager.register("post-step", (ctx) => ({
      action: "continue",
      modifiedFindings,
    }));

    const ctx = makeContext({ accumulatedFindings: [makeFinding("old-1", "low")] });
    await manager.execute("post-step", ctx);
    expect(ctx.accumulatedFindings).toEqual(modifiedFindings);
  });

  test("pre-step hooks can modify snapshot", async () => {
    const modifiedSnapshot = makeSnapshot({ projectName: "modified" });
    manager.register("pre-step", () => ({
      action: "continue",
      modifiedSnapshot,
    }));

    const ctx = makeContext();
    await manager.execute("pre-step", ctx);
    expect(ctx.snapshot.projectName).toBe("modified");
  });

  test("getHooks returns hooks filtered by phase", () => {
    manager.register("pre-step", () => ({ action: "continue" }));
    manager.register("post-step", () => ({ action: "continue" }));
    manager.register("on-error", () => ({ action: "continue" }));

    expect(manager.getHooks("pre-step")).toHaveLength(1);
    expect(manager.getHooks("post-step")).toHaveLength(1);
    expect(manager.getHooks()).toHaveLength(3);
  });

  test("reset clears all hooks and log", async () => {
    manager.register("pre-step", () => ({ action: "continue" }));
    await manager.execute("pre-step", makeContext());

    manager.reset();
    expect(manager.hookCount).toBe(0);
    expect(manager.getExecutionLog()).toHaveLength(0);
  });
});

describe("Built-in hooks", () => {
  let manager: PipelineHookManager;

  beforeEach(() => {
    manager = new PipelineHookManager();
  });

  test("createTimingHook records step duration", async () => {
    const timing = createTimingHook();
    manager.register("pre-step", timing.preStep);
    manager.register("post-step", timing.postStep);

    const ctx = makeContext({ stepIndex: 2 });
    await manager.execute("pre-step", ctx);

    // Simulate some time passing
    ctx.metadata.set("step-2-start", Date.now() - 150);

    await manager.execute("post-step", ctx);
    const duration = ctx.metadata.get("step-2-duration") as number;
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  test("createFindingThresholdHook aborts when critical count exceeds limit", async () => {
    manager.register("post-step", createFindingThresholdHook(2));

    const findings = [
      makeFinding("1", "critical"),
      makeFinding("2", "critical"),
      makeFinding("3", "critical"),
    ];

    const decision = await manager.execute(
      "post-step",
      makeContext({ accumulatedFindings: findings }),
    );
    expect(decision.action).toBe("abort");
  });

  test("createFindingThresholdHook continues when within limit", async () => {
    manager.register("post-step", createFindingThresholdHook(5));

    const findings = [makeFinding("1", "critical"), makeFinding("2", "high")];
    const decision = await manager.execute(
      "post-step",
      makeContext({ accumulatedFindings: findings }),
    );
    expect(decision.action).toBe("continue");
  });

  test("createScoreGateHook skips when score is above threshold", async () => {
    manager.register("pre-step", createScoreGateHook(70));

    const decision = await manager.execute(
      "pre-step",
      makeContext({ snapshot: makeSnapshot({ score: { overall: 85, modularity: 80, coupling: 80, cohesion: 80, layering: 80 } }) }),
    );
    expect(decision.action).toBe("skip");
  });

  test("createScoreGateHook continues when score is below threshold", async () => {
    manager.register("pre-step", createScoreGateHook(80));

    const decision = await manager.execute(
      "pre-step",
      makeContext({ snapshot: makeSnapshot({ score: { overall: 60, modularity: 50, coupling: 60, cohesion: 55, layering: 65 } }) }),
    );
    expect(decision.action).toBe("continue");
  });
});
