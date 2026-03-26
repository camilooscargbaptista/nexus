import { jest } from "@jest/globals";
import {
  ReactionEngine,
  SystemEvent,
  ReactionRule,
  ActionExecutor,
  ReactionAction,
  DEFAULT_REACTION_RULES,
} from "../reaction-engine";

// ═══════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════

const createMockExecutor = (): jest.Mocked<ActionExecutor> => ({
  execute: jest.fn(async (action: ReactionAction) => `${action} executed`),
});

const createTestEvent = (overrides: Partial<SystemEvent> = {}): SystemEvent => ({
  id: "evt-1",
  source: "ci",
  type: "ci.failed",
  severity: "high",
  title: "Test Event",
  description: "Test event description",
  metadata: { exitCode: 1 },
  timestamp: new Date(),
  ...overrides,
});

const createTestRule = (overrides: Partial<ReactionRule> = {}): ReactionRule => ({
  id: "test-rule",
  name: "Test Rule",
  description: "A test rule",
  enabled: true,
  eventTypes: ["ci.failed"],
  actions: ["notify"],
  priority: 5,
  cooldownMs: 0,
  maxRetries: 0,
  ...overrides,
});

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("ReactionEngine", () => {
  let executor: jest.Mocked<ActionExecutor>;
  let engine: ReactionEngine;

  beforeEach(() => {
    executor = createMockExecutor();
    engine = new ReactionEngine(executor);
  });

  describe("Constructor", () => {
    it("should load 6 default rules when no rules provided", () => {
      const rules = engine.getRules();
      expect(rules).toHaveLength(6);
      expect(rules.map((r) => r.id)).toContain("ci-critical-failure");
      expect(rules.map((r) => r.id)).toContain("security-vulnerability");
      expect(rules.map((r) => r.id)).toContain("deploy-failure");
      expect(rules.map((r) => r.id)).toContain("pr-review-requested");
      expect(rules.map((r) => r.id)).toContain("ci-test-failure");
      expect(rules.map((r) => r.id)).toContain("quality-gate-failed");
    });

    it("should load custom rules when provided", () => {
      const customRules = [
        createTestRule({ id: "custom-1" }),
        createTestRule({ id: "custom-2" }),
      ];
      const customEngine = new ReactionEngine(executor, customRules);
      const rules = customEngine.getRules();
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toEqual(["custom-1", "custom-2"]);
    });
  });

  describe("addRule / removeRule / setRuleEnabled", () => {
    it("should add a new rule", () => {
      const newRule = createTestRule({ id: "new-rule" });
      engine.addRule(newRule);
      const rules = engine.getRules();
      expect(rules.find((r) => r.id === "new-rule")).toEqual(newRule);
    });

    it("should remove a rule", () => {
      const rule = createTestRule({ id: "to-remove" });
      engine.addRule(rule);
      expect(engine.getRules()).toContainEqual(rule);
      engine.removeRule("to-remove");
      expect(engine.getRules().find((r) => r.id === "to-remove")).toBeUndefined();
    });

    it("should enable/disable a rule", () => {
      const rule = createTestRule({ id: "toggle-rule", enabled: true });
      engine.addRule(rule);

      engine.setRuleEnabled("toggle-rule", false);
      let rules = engine.getRules();
      expect(rules.find((r) => r.id === "toggle-rule")!.enabled).toBe(false);

      engine.setRuleEnabled("toggle-rule", true);
      rules = engine.getRules();
      expect(rules.find((r) => r.id === "toggle-rule")!.enabled).toBe(true);
    });

    it("should silently ignore setRuleEnabled for non-existent rule", () => {
      expect(() => engine.setRuleEnabled("non-existent", false)).not.toThrow();
    });
  });

  describe("processEvent — Event Type Matching", () => {
    it("should match exact event type", async () => {
      const rule = createTestRule({ id: "exact-rule", eventTypes: ["ci.failed"] });
      engine.addRule(rule);

      const event = createTestEvent({ type: "ci.failed" });
      const executions = await engine.processEvent(event);

      expect(executions).toHaveLength(1);
      expect(executions[0].ruleId).toBe("exact-rule");
    });

    it("should match glob patterns (ci.* matches ci.failed)", async () => {
      const rule = createTestRule({ id: "glob-rule", eventTypes: ["ci.*"] });
      engine.addRule(rule);

      const event = createTestEvent({ type: "ci.failed" });
      const executions = await engine.processEvent(event);

      expect(executions).toHaveLength(1);
      expect(executions[0].ruleId).toBe("glob-rule");
    });

    it("should not match unrelated event types", async () => {
      const rule = createTestRule({ id: "specific-rule", eventTypes: ["deploy.failed"] });
      engine.addRule(rule);

      const event = createTestEvent({ type: "ci.failed" });
      const executions = await engine.processEvent(event);

      expect(executions).toHaveLength(0);
    });

    it("should support multiple event type patterns in one rule", async () => {
      const rule = createTestRule({
        id: "multi-rule",
        eventTypes: ["ci.failed", "deploy.*"],
      });
      engine.addRule(rule);

      const ciEvent = createTestEvent({ type: "ci.failed" });
      const deployEvent = createTestEvent({ type: "deploy.rollback", source: "deploy" });

      const ciExecutions = await engine.processEvent(ciEvent);
      const deployExecutions = await engine.processEvent(deployEvent);

      expect(ciExecutions).toHaveLength(1);
      expect(deployExecutions).toHaveLength(1);
    });
  });

  describe("Severity Filtering", () => {
    it("should block events below severityMin threshold", async () => {
      const rule = createTestRule({
        id: "high-severity-rule",
        severityMin: "high",
        eventTypes: ["ci.*"],
      });
      engine.addRule(rule);

      const lowEvent = createTestEvent({ severity: "low" });
      const highEvent = createTestEvent({ severity: "high" });

      const lowExecutions = await engine.processEvent(lowEvent);
      const highExecutions = await engine.processEvent(highEvent);

      expect(lowExecutions).toHaveLength(0);
      expect(highExecutions).toHaveLength(1);
    });

    it("should match events at or above severity threshold", async () => {
      // Use engine with no default rules to isolate test
      const isolatedEngine = new ReactionEngine(executor, []);
      const rule = createTestRule({
        id: "medium-rule",
        severityMin: "medium",
        eventTypes: ["ci.*"],
      });
      isolatedEngine.addRule(rule);

      const mediumEvent = createTestEvent({ severity: "medium" });
      const criticalEvent = createTestEvent({ severity: "critical", id: "evt-2" });

      const mediumExecutions = await isolatedEngine.processEvent(mediumEvent);
      const criticalExecutions = await isolatedEngine.processEvent(criticalEvent);

      expect(mediumExecutions).toHaveLength(1);
      expect(criticalExecutions).toHaveLength(1);
    });
  });

  describe("Condition Evaluation", () => {
    it("should evaluate equals operator", async () => {
      const rule = createTestRule({
        id: "equals-rule",
        eventTypes: ["ci.*"],
        conditions: [{ field: "title", operator: "equals", value: "Test Event" }],
      });
      engine.addRule(rule);

      const matchEvent = createTestEvent({ title: "Test Event" });
      const noMatchEvent = createTestEvent({ title: "Different Event" });

      const matchExecutions = await engine.processEvent(matchEvent);
      const noMatchExecutions = await engine.processEvent(noMatchEvent);

      expect(matchExecutions).toHaveLength(1);
      expect(noMatchExecutions).toHaveLength(0);
    });

    it("should evaluate contains operator", async () => {
      const rule = createTestRule({
        id: "contains-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "description", operator: "contains", value: "event" },
        ],
      });
      engine.addRule(rule);

      const matchEvent = createTestEvent({ description: "This is a test event" });
      const noMatchEvent = createTestEvent({ description: "This is a test" });

      const matchExecutions = await engine.processEvent(matchEvent);
      const noMatchExecutions = await engine.processEvent(noMatchEvent);

      expect(matchExecutions).toHaveLength(1);
      expect(noMatchExecutions).toHaveLength(0);
    });

    it("should evaluate gt (greater than) operator", async () => {
      const rule = createTestRule({
        id: "gt-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "metadata.exitCode", operator: "gt", value: 0 },
        ],
      });
      engine.addRule(rule);

      const matchEvent = createTestEvent({
        metadata: { exitCode: 5 },
      });
      const noMatchEvent = createTestEvent({
        metadata: { exitCode: 0 },
      });

      const matchExecutions = await engine.processEvent(matchEvent);
      const noMatchExecutions = await engine.processEvent(noMatchEvent);

      expect(matchExecutions).toHaveLength(1);
      expect(noMatchExecutions).toHaveLength(0);
    });

    it("should evaluate lt (less than) operator", async () => {
      const rule = createTestRule({
        id: "lt-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "metadata.exitCode", operator: "lt", value: 10 },
        ],
      });
      engine.addRule(rule);

      const matchEvent = createTestEvent({ metadata: { exitCode: 5 } });
      const noMatchEvent = createTestEvent({ metadata: { exitCode: 15 } });

      const matchExecutions = await engine.processEvent(matchEvent);
      const noMatchExecutions = await engine.processEvent(noMatchEvent);

      expect(matchExecutions).toHaveLength(1);
      expect(noMatchExecutions).toHaveLength(0);
    });

    it("should evaluate matches (regex) operator", async () => {
      const rule = createTestRule({
        id: "matches-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "title", operator: "matches", value: "^Test.*Event$" },
        ],
      });
      engine.addRule(rule);

      const matchEvent = createTestEvent({ title: "Test CI Event" });
      const noMatchEvent = createTestEvent({ title: "Not Matching" });

      const matchExecutions = await engine.processEvent(matchEvent);
      const noMatchExecutions = await engine.processEvent(noMatchEvent);

      expect(matchExecutions).toHaveLength(1);
      expect(noMatchExecutions).toHaveLength(0);
    });

    it("should evaluate exists operator", async () => {
      const rule = createTestRule({
        id: "exists-rule",
        eventTypes: ["ci.*"],
        conditions: [{ field: "metadata.exitCode", operator: "exists", value: true }],
      });
      engine.addRule(rule);

      const matchEvent = createTestEvent({ metadata: { exitCode: 0 } });
      const noMatchEvent = createTestEvent({ metadata: {} });

      const matchExecutions = await engine.processEvent(matchEvent);
      const noMatchExecutions = await engine.processEvent(noMatchEvent);

      expect(matchExecutions).toHaveLength(1);
      expect(noMatchExecutions).toHaveLength(0);
    });

    it("should require all conditions to be met", async () => {
      const rule = createTestRule({
        id: "multi-condition-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "severity", operator: "equals", value: "high" },
          { field: "metadata.exitCode", operator: "gt", value: 0 },
        ],
      });
      engine.addRule(rule);

      const bothMatch = createTestEvent({
        severity: "high",
        metadata: { exitCode: 1 },
      });
      const firstMatch = createTestEvent({
        severity: "high",
        metadata: { exitCode: 0 },
      });

      const bothExecutions = await engine.processEvent(bothMatch);
      const firstExecutions = await engine.processEvent(firstMatch);

      expect(bothExecutions).toHaveLength(1);
      expect(firstExecutions).toHaveLength(0);
    });
  });

  describe("Nested Value Extraction (Dot Notation)", () => {
    it("should extract simple metadata fields", async () => {
      const rule = createTestRule({
        id: "nested-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "metadata.exitCode", operator: "equals", value: 1 },
        ],
      });
      engine.addRule(rule);

      const event = createTestEvent({ metadata: { exitCode: 1 } });
      const executions = await engine.processEvent(event);
      expect(executions).toHaveLength(1);
    });

    it("should handle deep nested values", async () => {
      const rule = createTestRule({
        id: "deep-nested-rule",
        eventTypes: ["ci.*"],
        conditions: [
          {
            field: "metadata.details.stage",
            operator: "equals",
            value: "build",
          },
        ],
      });
      engine.addRule(rule);

      const event = createTestEvent({
        metadata: { details: { stage: "build" } },
      });
      const executions = await engine.processEvent(event);
      expect(executions).toHaveLength(1);
    });

    it("should return undefined for missing nested paths", async () => {
      const rule = createTestRule({
        id: "missing-path-rule",
        eventTypes: ["ci.*"],
        conditions: [
          { field: "metadata.missing.field", operator: "exists", value: true },
        ],
      });
      engine.addRule(rule);

      const event = createTestEvent({ metadata: {} });
      const executions = await engine.processEvent(event);
      expect(executions).toHaveLength(0);
    });
  });

  describe("Cooldown", () => {
    it("should skip second event within cooldown window", async () => {
      const rule = createTestRule({
        id: "cooldown-rule",
        eventTypes: ["ci.*"],
        cooldownMs: 1000,
      });
      engine.addRule(rule);

      const event = createTestEvent();

      const firstExecutions = await engine.processEvent(event);
      expect(firstExecutions).toHaveLength(1);

      const secondExecutions = await engine.processEvent(event);
      expect(secondExecutions).toHaveLength(0);
    });

    it("should allow event after cooldown expires", async () => {
      jest.useFakeTimers();

      const rule = createTestRule({
        id: "cooldown-rule",
        eventTypes: ["ci.*"],
        cooldownMs: 1000,
      });
      engine.addRule(rule);

      const event = createTestEvent();

      const firstExecutions = await engine.processEvent(event);
      expect(firstExecutions).toHaveLength(1);

      jest.advanceTimersByTime(1100);

      const secondExecutions = await engine.processEvent(event);
      expect(secondExecutions).toHaveLength(1);

      jest.useRealTimers();
    });

    it("should not enforce cooldown when cooldownMs is 0", async () => {
      const rule = createTestRule({
        id: "no-cooldown-rule",
        eventTypes: ["ci.*"],
        cooldownMs: 0,
      });
      engine.addRule(rule);

      const event = createTestEvent();

      const firstExecutions = await engine.processEvent(event);
      expect(firstExecutions).toHaveLength(1);

      const secondExecutions = await engine.processEvent(event);
      expect(secondExecutions).toHaveLength(1);
    });
  });

  describe("Action Execution", () => {
    it("should execute all actions in a rule", async () => {
      const rule = createTestRule({
        id: "multi-action-rule",
        eventTypes: ["ci.*"],
        actions: ["notify", "analyze", "auto-fix"],
      });
      engine.addRule(rule);

      const event = createTestEvent();
      await engine.processEvent(event);

      expect(executor.execute).toHaveBeenCalledTimes(3);
      expect(executor.execute).toHaveBeenCalledWith("notify", event, expect.any(Object));
      expect(executor.execute).toHaveBeenCalledWith("analyze", event, expect.any(Object));
      expect(executor.execute).toHaveBeenCalledWith("auto-fix", event, expect.any(Object));
    });

    it("should record action execution results", async () => {
      executor.execute.mockImplementation(async (action) => `${action} result`);

      const rule = createTestRule({
        id: "action-result-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions[0].result).toContain("notify result");
      expect(executions[0].status).toBe("completed");
    });
  });

  describe("Retry Logic", () => {
    it("should retry action up to maxRetries on failure", async () => {
      executor.execute
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValueOnce("Success");

      const rule = createTestRule({
        id: "retry-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        maxRetries: 2,
      });
      engine.addRule(rule);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executor.execute).toHaveBeenCalledTimes(2);
      expect(executions[0].retryCount).toBe(1);
      expect(executions[0].status).toBe("completed");
    });

    it("should mark execution as failed after maxRetries exhausted", async () => {
      executor.execute.mockRejectedValue(new Error("Persistent failure"));

      const rule = createTestRule({
        id: "failed-retry-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        maxRetries: 1,
      });
      engine.addRule(rule);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions[0].status).toBe("failed");
      expect(executions[0].result).toContain("FAILED");
      expect(executions[0].retryCount).toBe(2);
    });

    it("should track max retry count when multiple actions are retried", async () => {
      executor.execute
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockResolvedValueOnce("Success 1")
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockRejectedValueOnce(new Error("Fail 2 again"))
        .mockResolvedValueOnce("Success 2");

      const rule = createTestRule({
        id: "multi-retry-rule",
        eventTypes: ["ci.*"],
        actions: ["notify", "analyze"],
        maxRetries: 2,
      });
      engine.addRule(rule);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions[0].retryCount).toBe(2);
    });
  });

  describe("Escalation", () => {
    it("should escalate after N failures", async () => {
      // Use isolated engine with only the escalation rule
      const isolatedEngine = new ReactionEngine(executor, []);
      const rule = createTestRule({
        id: "escalate-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        maxRetries: 0,
        escalateAfter: 2,
        escalateTo: "escalate",
      });
      isolatedEngine.addRule(rule);

      // Mock: actions fail, but escalation succeeds
      executor.execute.mockImplementation(async (action: ReactionAction) => {
        if (action === "escalate") return "escalated";
        throw new Error("Action failed");
      });

      const event = createTestEvent();

      // First failure — no escalation yet
      await isolatedEngine.processEvent(event);
      expect(executor.execute).not.toHaveBeenCalledWith("escalate", expect.anything(), expect.anything());

      // Second failure triggers escalation
      executor.execute.mockClear();
      executor.execute.mockImplementation(async (action: ReactionAction) => {
        if (action === "escalate") return "escalated";
        throw new Error("Action failed");
      });
      await isolatedEngine.processEvent(event);
      expect(executor.execute).toHaveBeenCalledWith("escalate", event, expect.any(Object));
    });

    it("should reset failure count on success", async () => {
      // Use isolated engine with only the reset rule
      const isolatedEngine = new ReactionEngine(executor, []);
      const rule = createTestRule({
        id: "reset-fail-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        maxRetries: 0,
        escalateAfter: 2,
        escalateTo: "escalate",
      });
      isolatedEngine.addRule(rule);

      const event = createTestEvent();

      // First failure
      executor.execute.mockRejectedValueOnce(new Error("Failed"));
      await isolatedEngine.processEvent(event);

      // Success resets counter
      executor.execute.mockResolvedValueOnce("Success");
      await isolatedEngine.processEvent(event);

      // Third event should not escalate (counter was reset)
      executor.execute.mockClear();
      executor.execute.mockRejectedValueOnce(new Error("Failed"));
      await isolatedEngine.processEvent(event);

      expect(executor.execute).not.toHaveBeenCalledWith("escalate", expect.anything(), expect.anything());
    });
  });

  describe("getStats", () => {
    it("should return statistics for processed events", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "stat-rule",
        eventTypes: ["ci.*"],
        actions: ["notify", "analyze"],
      });
      engine.addRule(rule);

      const event = createTestEvent({ source: "ci", severity: "high" });
      await engine.processEvent(event);

      const stats = engine.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.totalReactions).toBe(1);
      expect(stats.bySource.ci).toBe(1);
      expect(stats.byAction.notify).toBe(1);
      expect(stats.byAction.analyze).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.successRate).toBe(1);
    });

    it("should track success rate correctly", async () => {
      const rule = createTestRule({
        id: "success-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        maxRetries: 0,
      });
      engine.addRule(rule);

      executor.execute.mockResolvedValueOnce("Success");
      await engine.processEvent(createTestEvent());

      executor.execute.mockRejectedValueOnce(new Error("Failed"));
      await engine.processEvent(createTestEvent({ id: "evt-2" }));

      const stats = engine.getStats();
      expect(stats.successRate).toBe(0.5);
    });

    it("should calculate average reaction time", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "timing-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      await engine.processEvent(createTestEvent());

      const stats = engine.getStats();
      expect(stats.avgReactionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should count unique events in statistics", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "unique-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      const event = createTestEvent({ id: "evt-same" });
      await engine.processEvent(event);
      await engine.processEvent(event);

      const stats = engine.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.totalReactions).toBe(2);
    });
  });

  describe("getHistory", () => {
    it("should return execution history", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "history-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      await engine.processEvent(createTestEvent({ id: "evt-1" }));
      await engine.processEvent(createTestEvent({ id: "evt-2" }));

      const history = engine.getHistory();
      expect(history).toHaveLength(2);
    });

    it("should limit history to specified count", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "limit-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      for (let i = 0; i < 10; i++) {
        await engine.processEvent(createTestEvent({ id: `evt-${i}` }));
      }

      const history = engine.getHistory(5);
      expect(history).toHaveLength(5);
      expect(history[0].event.id).toBe("evt-5");
      expect(history[4].event.id).toBe("evt-9");
    });

    it("should return most recent executions when limited", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "recent-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      await engine.processEvent(createTestEvent({ id: "evt-1" }));
      await engine.processEvent(createTestEvent({ id: "evt-2" }));
      await engine.processEvent(createTestEvent({ id: "evt-3" }));

      const history = engine.getHistory(2);
      expect(history).toHaveLength(2);
      expect(history[0].event.id).toBe("evt-2");
      expect(history[1].event.id).toBe("evt-3");
    });
  });

  describe("getRules", () => {
    it("should return all registered rules", () => {
      const rules = engine.getRules();
      expect(rules).toHaveLength(DEFAULT_REACTION_RULES.length);
      expect(Array.isArray(rules)).toBe(true);
    });

    it("should return rules after adding custom rules", () => {
      const newRule = createTestRule({ id: "custom" });
      engine.addRule(newRule);

      const rules = engine.getRules();
      expect(rules.find((r) => r.id === "custom")).toEqual(newRule);
    });
  });

  describe("reset", () => {
    it("should clear history and counters", async () => {
      executor.execute.mockResolvedValue("Success");

      const rule = createTestRule({
        id: "reset-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
      });
      engine.addRule(rule);

      await engine.processEvent(createTestEvent());

      let history = engine.getHistory();
      expect(history).toHaveLength(1);

      engine.reset();

      history = engine.getHistory();
      expect(history).toHaveLength(0);

      const stats = engine.getStats();
      expect(stats.totalReactions).toBe(0);
    });

    it("should reset cooldown counters", async () => {
      // Use isolated engine to avoid default rules interfering
      const isolatedEngine = new ReactionEngine(executor, []);
      const rule = createTestRule({
        id: "cooldown-reset-rule",
        eventTypes: ["ci.*"],
        cooldownMs: 10000,
      });
      isolatedEngine.addRule(rule);

      const event = createTestEvent();

      const firstExecutions = await isolatedEngine.processEvent(event);
      expect(firstExecutions).toHaveLength(1);

      const secondExecutions = await isolatedEngine.processEvent(event);
      expect(secondExecutions).toHaveLength(0);

      isolatedEngine.reset();

      const thirdExecutions = await isolatedEngine.processEvent(event);
      expect(thirdExecutions).toHaveLength(1);
    });

    it("should reset failure counters", async () => {
      // Use isolated engine to avoid default rules interfering
      const isolatedEngine = new ReactionEngine(executor, []);
      const rule = createTestRule({
        id: "fail-reset-rule",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        maxRetries: 0,
        escalateAfter: 2,
        escalateTo: "escalate",
      });
      isolatedEngine.addRule(rule);

      const event = createTestEvent();

      // First failure
      executor.execute.mockRejectedValueOnce(new Error("Failed"));
      await isolatedEngine.processEvent(event);

      isolatedEngine.reset();

      // After reset, failure counter is 0 so 1 failure shouldn't escalate
      executor.execute.mockClear();
      executor.execute.mockRejectedValueOnce(new Error("Failed"));
      await isolatedEngine.processEvent(event);

      expect(executor.execute).not.toHaveBeenCalledWith("escalate", expect.anything(), expect.anything());
    });
  });

  describe("Disabled Rules", () => {
    it("should skip disabled rules", async () => {
      const rule = createTestRule({
        id: "disabled-rule",
        enabled: false,
        eventTypes: ["ci.*"],
      });
      engine.addRule(rule);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions).toHaveLength(0);
    });

    it("should execute rules after re-enabling them", async () => {
      const rule = createTestRule({
        id: "reenable-rule",
        enabled: false,
        eventTypes: ["ci.*"],
      });
      engine.addRule(rule);

      engine.setRuleEnabled("reenable-rule", true);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions).toHaveLength(1);
    });
  });

  describe("Priority Ordering", () => {
    it("should execute rules in priority order (lower first)", async () => {
      executor.execute.mockResolvedValue("Success");

      const lowPriorityRule = createTestRule({
        id: "low-priority",
        eventTypes: ["ci.*"],
        actions: ["notify"],
        priority: 10,
      });
      const highPriorityRule = createTestRule({
        id: "high-priority",
        eventTypes: ["ci.*"],
        actions: ["analyze"],
        priority: 1,
      });

      engine.addRule(lowPriorityRule);
      engine.addRule(highPriorityRule);

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions).toHaveLength(2);
      expect(executions[0].ruleId).toBe("high-priority");
      expect(executions[1].ruleId).toBe("low-priority");
    });

    it("should maintain execution order based on rule priority", async () => {
      executor.execute.mockResolvedValue("Success");

      const rules = [
        createTestRule({ id: "rule-3", eventTypes: ["ci.*"], priority: 3 }),
        createTestRule({ id: "rule-1", eventTypes: ["ci.*"], priority: 1 }),
        createTestRule({ id: "rule-2", eventTypes: ["ci.*"], priority: 2 }),
      ];

      rules.forEach((r) => engine.addRule(r));

      const event = createTestEvent();
      const executions = await engine.processEvent(event);

      expect(executions.map((e) => e.ruleId)).toEqual([
        "rule-1",
        "rule-2",
        "rule-3",
      ]);
    });
  });
});
