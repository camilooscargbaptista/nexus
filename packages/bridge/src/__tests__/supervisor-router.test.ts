/**
 * @nexus/bridge — Supervisor Router Tests
 */

import { describe, it, expect, jest } from "@jest/globals";
import { IntentClassifier } from "../intent-classifier.js";
import { RoutingStrategy } from "../routing-strategy.js";
import { SupervisorRouter } from "../supervisor-router.js";
import type { ClassificationResult } from "../intent-classifier.js";

// ═══════════════════════════════════════════════════════════════
// INTENT CLASSIFIER
// ═══════════════════════════════════════════════════════════════

describe("IntentClassifier", () => {
  const classifier = new IntentClassifier();

  it("should classify security queries", async () => {
    const result = await classifier.classify("fix XSS vulnerability in the authentication module");
    expect(result.primary).toBe("security");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.matchedKeywords).toContain("xss");
  });

  it("should classify performance queries", async () => {
    const result = await classifier.classify("optimize the slow database query and add cache");
    expect(result.primary).toBe("performance");
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("should classify architecture queries", async () => {
    const result = await classifier.classify("review the dependency coupling between modules");
    expect(result.primary).toBe("architecture");
  });

  it("should return unknown for gibberish", async () => {
    const result = await classifier.classify("asdfgh zxcvbn");
    expect(result.primary).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("should detect secondary intents", async () => {
    const result = await classifier.classify("fix security vulnerability and optimize performance bottleneck");
    expect(result.secondary.length).toBeGreaterThan(0);
  });

  it("should support sync classification", () => {
    const result = classifier.classifySync("add unit tests for the auth module");
    expect(result.primary).toBe("testing");
    expect(result.method).toBe("pattern");
  });

  it("should use LLM fallback when pattern fails", async () => {
    const withLLM = new IntentClassifier({
      minConfidence: 999, // Force pattern to fail
      llmFallback: async () => "security",
    });

    const result = await withLLM.classify("some ambiguous query");
    expect(result.primary).toBe("security");
    expect(result.method).toBe("llm");
  });

  it("should handle LLM fallback failure gracefully", async () => {
    const withFailingLLM = new IntentClassifier({
      minConfidence: 999,
      llmFallback: async () => { throw new Error("LLM down"); },
    });

    const result = await withFailingLLM.classify("some query about testing");
    // Should fallback to pattern result
    expect(result.method).toBe("pattern");
  });

  it("should classify debugging queries", async () => {
    const result = await classifier.classify("debug the error and investigate the root cause of the crash");
    expect(result.primary).toBe("debugging");
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTING STRATEGY
// ═══════════════════════════════════════════════════════════════

describe("RoutingStrategy", () => {
  const strategy = new RoutingStrategy();

  it("should route from intent only", () => {
    const intent: ClassificationResult = {
      primary: "security",
      confidence: 0.8,
      secondary: [],
      method: "pattern",
      matchedKeywords: ["security", "xss"],
    };

    const plan = strategy.route(intent);
    expect(plan.skills.length).toBeGreaterThan(0);
    expect(plan.skills[0]!.skillId).toBe("security-review");
    expect(plan.strategy).toBe("intent-classify");
  });

  it("should route from BM25 only", () => {
    const intent: ClassificationResult = {
      primary: "unknown",
      confidence: 0,
      secondary: [],
      method: "pattern",
      matchedKeywords: [],
    };

    const bm25 = [
      { id: "code-review", name: "Code Review", score: 0.9 },
      { id: "design-patterns", name: "Design Patterns", score: 0.6 },
    ];

    const plan = strategy.route(intent, bm25);
    expect(plan.strategy).toBe("fast-match");
    expect(plan.skills[0]!.skillId).toBe("code-review");
  });

  it("should hybrid merge BM25 + intent", () => {
    const intent: ClassificationResult = {
      primary: "security",
      confidence: 0.8,
      secondary: [],
      method: "pattern",
      matchedKeywords: ["security"],
    };

    const bm25 = [
      { id: "security-review", name: "Security Review", score: 0.7 },
    ];

    const plan = strategy.route(intent, bm25);
    expect(plan.strategy).toBe("hybrid-merge");
    // security-review should be boosted since it appears in both
    expect(plan.skills[0]!.skillId).toBe("security-review");
  });

  it("should limit skills to maxSkills", () => {
    const limited = new RoutingStrategy({ maxSkills: 1 });
    const intent: ClassificationResult = {
      primary: "architecture",
      confidence: 0.8,
      secondary: ["quality"],
      method: "pattern",
      matchedKeywords: ["architecture"],
    };

    const plan = limited.route(intent);
    expect(plan.skills.length).toBeLessThanOrEqual(1);
  });

  it("should return empty plan for no match", () => {
    const intent: ClassificationResult = {
      primary: "unknown",
      confidence: 0,
      secondary: [],
      method: "pattern",
      matchedKeywords: [],
    };

    const plan = strategy.route(intent);
    expect(plan.skills.length).toBe(0);
    expect(plan.confidence).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// SUPERVISOR ROUTER
// ═══════════════════════════════════════════════════════════════

describe("SupervisorRouter", () => {
  it("should decide with pattern classification", async () => {
    const supervisor = new SupervisorRouter();
    const decision = await supervisor.decide("review the security of the auth module");

    expect(decision.query).toBe("review the security of the auth module");
    expect(decision.classification.primary).toBe("security");
    expect(decision.plan.skills.length).toBeGreaterThan(0);
    expect(decision.decisionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should decide sync", () => {
    const supervisor = new SupervisorRouter();
    const decision = supervisor.decideSync("add integration tests for the API");

    expect(decision.classification.primary).toBe("testing");
    expect(decision.plan.skills.length).toBeGreaterThan(0);
  });

  it("should use external searchFn", async () => {
    const supervisor = new SupervisorRouter({
      searchFn: () => [
        { id: "custom-skill", name: "Custom Skill", score: 0.95 },
      ],
    });

    const decision = await supervisor.decide("do something custom");
    expect(decision.plan.skills.some((s) => s.skillId === "custom-skill")).toBe(true);
  });

  it("should include decision time", async () => {
    const supervisor = new SupervisorRouter();
    const decision = await supervisor.decide("analyze architecture");
    expect(typeof decision.decisionTimeMs).toBe("number");
  });
});
