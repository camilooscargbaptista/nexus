/**
 * Tests for DriftScheduler
 */

import { DriftScheduler } from "../drift-scheduler.js";
import type { CodebaseInspector, ADRConstraint } from "../drift-detector.js";
import { NexusEventType } from "@nexus/types";
import type { NexusEvent } from "@nexus/types";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function makeInspector(overrides: Partial<CodebaseInspector> = {}): CodebaseInspector {
  return {
    getImports: () => new Map(),
    getFiles: () => ["src/index.ts", "src/app.ts"],
    findUsages: () => [],
    getLayers: () => new Map(),
    ...overrides,
  };
}

function makeAdrs(count = 1): ADRConstraint[] {
  return Array.from({ length: count }, (_, i) => ({
    adrId: `ADR-${i + 1}`,
    title: `Test ADR ${i + 1}`,
    status: "accepted" as const,
    date: "2026-01-01",
    constraints: [
      {
        type: "technology-mandate" as const,
        description: `Must use TypeScript`,
        rule: { technology: "typescript" },
      },
    ],
  }));
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("DriftScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should create a scheduler", () => {
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
    });
    expect(scheduler).toBeDefined();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("should run an immediate check on start", () => {
    const inspector = makeInspector({
      findUsages: (pattern: string) =>
        pattern === "typescript"
          ? [{ file: "src/index.ts", line: 1, snippet: "import ts" }]
          : [],
    });

    const scheduler = new DriftScheduler(inspector, {
      adrs: makeAdrs(),
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.getSnapshots()).toHaveLength(1);

    const latest = scheduler.getLatest();
    expect(latest).not.toBeNull();
    expect(latest!.driftScore).toBe(100);
    expect(latest!.violationCount).toBe(0);

    scheduler.stop();
  });

  it("should stop the scheduler", () => {
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("should not start twice", () => {
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
    });

    scheduler.start();
    scheduler.start(); // Should be idempotent
    expect(scheduler.getSnapshots()).toHaveLength(1);

    scheduler.stop();
  });

  it("should run scheduled checks at interval", () => {
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
      intervalMs: 1000,
    });

    scheduler.start();
    expect(scheduler.getSnapshots()).toHaveLength(1);

    jest.advanceTimersByTime(1000);
    expect(scheduler.getSnapshots()).toHaveLength(2);

    jest.advanceTimersByTime(1000);
    expect(scheduler.getSnapshots()).toHaveLength(3);

    scheduler.stop();
  });

  it("should emit events via the registered emitter", () => {
    const events: NexusEvent[] = [];
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
      minDriftScore: 80,
    });

    scheduler.onEvent((event) => events.push(event));
    scheduler.start();

    // First check: no TypeScript found → driftScore 0 → below minDriftScore → drift.detected
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(NexusEventType.DRIFT_DETECTED);
    expect(events[0].source).toBe("perception");
    expect(events[0].payload).toHaveProperty("driftScore");

    scheduler.stop();
  });

  it("should detect drift when score drops significantly", () => {
    let findTs = true;
    const inspector = makeInspector({
      findUsages: (pattern: string) =>
        pattern === "typescript" && findTs
          ? [{ file: "src/index.ts", line: 1, snippet: "import ts" }]
          : [],
    });

    const scheduler = new DriftScheduler(inspector, {
      adrs: makeAdrs(),
      intervalMs: 1000,
      deltaThreshold: 10,
      minDriftScore: 50,
    });

    const events: NexusEvent[] = [];
    scheduler.onEvent((e) => events.push(e));

    scheduler.start();
    // First check: compliant → score 100 → drift.check
    expect(scheduler.getLatest()!.driftScore).toBe(100);

    // Remove typescript usage → score drops to 0
    findTs = false;
    jest.advanceTimersByTime(1000);

    const latest = scheduler.getLatest()!;
    expect(latest.driftScore).toBe(0);
    // All emitted events use NexusEventType.DRIFT_DETECTED
    expect(events[events.length - 1].type).toBe(NexusEventType.DRIFT_DETECTED);

    scheduler.stop();
  });

  it("should detect improvement when score rises significantly", () => {
    let findTs = false;
    const inspector = makeInspector({
      findUsages: (pattern: string) =>
        pattern === "typescript" && findTs
          ? [{ file: "src/index.ts", line: 1, snippet: "import ts" }]
          : [],
    });

    const scheduler = new DriftScheduler(inspector, {
      adrs: makeAdrs(),
      intervalMs: 1000,
      deltaThreshold: 10,
      minDriftScore: 0, // Don't alert on low score for this test
    });

    const events: NexusEvent[] = [];
    scheduler.onEvent((e) => events.push(e));

    scheduler.start();
    // First check: non-compliant → score 0
    expect(scheduler.getLatest()!.driftScore).toBe(0);

    // Add typescript usage → score jumps to 100
    findTs = true;
    jest.advanceTimersByTime(1000);

    expect(scheduler.getLatest()!.driftScore).toBe(100);
    // All emitted events use NexusEventType.DRIFT_DETECTED, internal type is in payload
    expect(events[events.length - 1].type).toBe(NexusEventType.DRIFT_DETECTED);

    scheduler.stop();
  });

  it("should support manual runCheck()", () => {
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
    });

    const event = scheduler.runCheck();
    expect(event.type).toBeDefined();
    expect(event.current.driftScore).toBeDefined();
    expect(scheduler.getSnapshots()).toHaveLength(1);
  });

  it("should load pre-existing snapshots", () => {
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
    });

    scheduler.loadSnapshots([
      {
        timestamp: "2026-01-01T00:00:00Z",
        driftScore: 85,
        violationCount: 2,
        result: {
          timestamp: "2026-01-01T00:00:00Z",
          adrsEvaluated: 1,
          constraintsChecked: 3,
          drifts: [],
          compliant: [],
          driftScore: 85,
          summary: "Test",
        },
      },
    ]);

    expect(scheduler.getSnapshots()).toHaveLength(1);
    expect(scheduler.getLatest()!.driftScore).toBe(85);
  });

  it("should include correlationId in emitted events", () => {
    const events: NexusEvent[] = [];
    const scheduler = new DriftScheduler(makeInspector(), {
      adrs: makeAdrs(),
    });

    scheduler.onEvent((e) => events.push(e));
    scheduler.runCheck();

    expect(events[0].correlationId).toContain("drift-cycle-");
  });
});
