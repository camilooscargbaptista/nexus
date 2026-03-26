/**
 * Tests for Continuous Learning Engine
 */

import { LearningEngine } from "../learning-engine.js";
import { FeedbackStore, InMemoryPersistence } from "../feedback-store.js";
import type { FindingOutcome, FixOutcome, PipelineRun } from "../feedback-store.js";

// ─── Helpers ──────────────────────────────────────────────────

function makeStore(): FeedbackStore {
  return new FeedbackStore(new InMemoryPersistence());
}

function makeRun(id: string, score: number, timestamp?: string): PipelineRun {
  return {
    id,
    projectPath: "/test",
    timestamp: timestamp ?? new Date().toISOString(),
    duration: 1000,
    scores: { overall: score },
    findingsCount: 10,
    criticalCount: 1,
    highCount: 3,
    remediationsAttempted: 2,
    remediationsSucceeded: 1,
  };
}

function makeFindingOutcome(
  findingId: string,
  category: string,
  outcome: FindingOutcome["outcome"],
  severity = "medium",
): FindingOutcome {
  return {
    findingId,
    runId: "run-1",
    timestamp: new Date().toISOString(),
    severity,
    category,
    outcome,
  };
}

function makeFixOutcome(
  fixId: string,
  applied: boolean,
  reverted: boolean,
  effective: boolean,
): FixOutcome {
  return {
    fixId,
    findingId: `finding-${fixId}`,
    runId: "run-1",
    timestamp: new Date().toISOString(),
    applied,
    reverted,
    scoreBefore: 60,
    scoreAfter: effective ? 70 : 60,
    effective,
  };
}

async function populateStore(
  store: FeedbackStore,
  outcomes: FindingOutcome[],
  fixOutcomes: FixOutcome[] = [],
  runs: PipelineRun[] = [],
): Promise<void> {
  for (const run of runs) await store.recordRun(run);
  for (const o of outcomes) await store.recordFindingOutcome(o);
  for (const f of fixOutcomes) await store.recordFixOutcome(f);
}

// ─── Tests ────────────────────────────────────────────────────

describe("LearningEngine", () => {
  test("produces empty report when no data", async () => {
    const engine = new LearningEngine();
    const store = makeStore();

    const report = await engine.analyze(store);
    expect(report.adjustments).toHaveLength(0);
    expect(report.suppressions).toHaveLength(0);
    expect(report.boosts).toHaveLength(0);
    expect(report.learningQuality).toBe(0);
  });

  test("suggests suppression for high false-positive categories", async () => {
    const engine = new LearningEngine({ minSamples: 5, suppressionThreshold: 0.4 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "noisy-rule", i < 7 ? "false-positive" : "accepted"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);

    const suppression = report.suppressions.find(s => s.category === "noisy-rule");
    expect(suppression).toBeDefined();
    expect(suppression!.falsePositiveRate).toBe(70);
  });

  test("suggests severity lower for high dismiss rate", async () => {
    const engine = new LearningEngine({ minSamples: 5 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 12; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "over-classified", i < 8 ? "dismissed" : "accepted"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);
    const adj = report.adjustments.find(a => a.category === "over-classified" && a.adjustment === "lower-severity");
    expect(adj).toBeDefined();
  });

  test("boosts priority for high acceptance categories", async () => {
    const engine = new LearningEngine({ minSamples: 5, boostThreshold: 0.8 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "valuable-rule", i < 9 ? "accepted" : "dismissed"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);

    const boost = report.boosts.find(b => b.category === "valuable-rule");
    expect(boost).toBeDefined();
    expect(boost!.boostFactor).toBeGreaterThan(1.0);
    expect(boost!.acceptanceRate).toBe(90);
  });

  test("flags high fix revert rate", async () => {
    const engine = new LearningEngine({ minSamples: 5, maxRevertRate: 0.3 });
    const store = makeStore();

    const fixOutcomes: FixOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      fixOutcomes.push(makeFixOutcome(`fix-${i}`, true, i < 5, i >= 5));
    }
    await populateStore(store, [], fixOutcomes);

    const report = await engine.analyze(store);
    const adj = report.adjustments.find(a => a.category === "__auto-fix__");
    expect(adj).toBeDefined();
    expect(adj!.adjustment).toBe("increase-threshold");
  });

  test("generates trend insights for degrading codebase", async () => {
    const engine = new LearningEngine();
    const store = makeStore();

    const runs = [
      makeRun("r1", 80, "2026-01-01T00:00:00Z"),
      makeRun("r2", 75, "2026-01-08T00:00:00Z"),
      makeRun("r3", 70, "2026-01-15T00:00:00Z"),
      makeRun("r4", 65, "2026-01-22T00:00:00Z"),
      makeRun("r5", 60, "2026-01-29T00:00:00Z"),
    ];
    await populateStore(store, [], [], runs);

    const report = await engine.analyze(store);
    const insight = report.insights.find(i => i.title.includes("declining"));
    expect(insight).toBeDefined();
  });

  test("shouldShow returns false for suppressed categories", async () => {
    const engine = new LearningEngine({ minSamples: 3, suppressionThreshold: 0.4 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "bad-rule", "false-positive"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);
    expect(engine.shouldShow("bad-rule", report)).toBe(false);
    expect(engine.shouldShow("good-rule", report)).toBe(true);
  });

  test("getPriorityMultiplier returns boost factor for boosted categories", async () => {
    const engine = new LearningEngine({ minSamples: 5, boostThreshold: 0.8 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "great-rule", "accepted"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);
    expect(engine.getPriorityMultiplier("great-rule", report)).toBeGreaterThan(1.0);
    expect(engine.getPriorityMultiplier("unknown-rule", report)).toBe(1.0);
  });

  test("respects minSamples — no adjustments with insufficient data", async () => {
    const engine = new LearningEngine({ minSamples: 20 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 5; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "sparse-rule", "false-positive"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);
    expect(report.adjustments.filter(a => a.category === "sparse-rule")).toHaveLength(0);
    expect(report.suppressions.filter(s => s.category === "sparse-rule")).toHaveLength(0);
  });

  test("learning quality increases with more data", async () => {
    const engine = new LearningEngine({ minSamples: 1 });

    const smallStore = makeStore();
    await populateStore(smallStore, [makeFindingOutcome("f1", "cat", "accepted")]);
    const smallReport = await engine.analyze(smallStore);

    const bigStore = makeStore();
    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 100; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "cat", "accepted"));
    }
    await populateStore(bigStore, outcomes);
    const bigReport = await engine.analyze(bigStore);

    expect(bigReport.learningQuality).toBeGreaterThan(smallReport.learningQuality);
  });

  test("insights detect anomalous critical ratio", async () => {
    const engine = new LearningEngine({ minSamples: 1 });
    const store = makeStore();

    const outcomes: FindingOutcome[] = [];
    for (let i = 0; i < 30; i++) {
      outcomes.push(makeFindingOutcome(`f-${i}`, "sec", "accepted", i < 15 ? "critical" : "low"));
    }
    await populateStore(store, outcomes);

    const report = await engine.analyze(store);
    const anomaly = report.insights.find(i => i.title.includes("critical findings"));
    expect(anomaly).toBeDefined();
  });

  test("insights detect low fix effectiveness", async () => {
    const engine = new LearningEngine();
    const store = makeStore();

    const runs = [
      makeRun("r1", 60, "2026-01-01T00:00:00Z"),
      makeRun("r2", 60, "2026-01-08T00:00:00Z"),
      makeRun("r3", 60, "2026-01-15T00:00:00Z"),
      makeRun("r4", 60, "2026-01-22T00:00:00Z"),
      makeRun("r5", 60, "2026-01-29T00:00:00Z"),
    ];
    const fixes: FixOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      fixes.push(makeFixOutcome(`fix-${i}`, true, false, i < 3));
    }
    await populateStore(store, [], fixes, runs);

    const report = await engine.analyze(store);
    const insight = report.insights.find(i => i.title.includes("auto-fix effectiveness"));
    expect(insight).toBeDefined();
  });
});
