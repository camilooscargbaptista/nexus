import { jest } from "@jest/globals";
import {
  IntentRouter,
  createIntentRouter,
  RoutingRule,
  ComplexityTier,
  CynefinDomain,
  ResponseMode,
  WorkflowFamily,
  IntentContext,
} from "../intent-router";

// ═══════════════════════════════════════════════════════════════
// FIXTURES & HELPERS
// ═══════════════════════════════════════════════════════════════

function createTestRule(overrides?: Partial<RoutingRule>): RoutingRule {
  return {
    id: "test-rule",
    name: "Test Rule",
    keywords: ["test"],
    workflow: "diamond-develop",
    priority: 50,
    ...overrides,
  };
}

function createTestContext(overrides?: Partial<IntentContext>): IntentContext {
  return {
    hasCodebase: true,
    hasTests: true,
    hasPR: false,
    hasSecurityConcern: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONSTRUCTOR TESTS
// ═══════════════════════════════════════════════════════════════

describe("IntentRouter Constructor", () => {
  it("should load 13 default rules when no rules provided", () => {
    const router = new IntentRouter();
    const rules = router.getRules();
    expect(rules).toHaveLength(13);
  });

  it("should load default rules with correct IDs", () => {
    const router = new IntentRouter();
    const rules = router.getRules();
    const ids = rules.map(r => r.id);

    expect(ids).toContain("security-audit");
    expect(ids).toContain("arch-review");
    expect(ids).toContain("factory");
    expect(ids).toContain("debate");
    expect(ids).toContain("adversarial");
    expect(ids).toContain("performance");
    expect(ids).toContain("cost-optimize");
    expect(ids).toContain("research");
    expect(ids).toContain("planning");
    expect(ids).toContain("develop");
    expect(ids).toContain("review");
    expect(ids).toContain("synthesize");
    expect(ids).toContain("quick");
  });

  it("should accept custom rules via constructor", () => {
    const customRule = createTestRule({
      id: "custom-rule",
      priority: 5,
    });

    const router = new IntentRouter([customRule]);
    const rules = router.getRules();

    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("custom-rule");
  });

  it("should replace default rules when custom rules array provided", () => {
    const customRules = [
      createTestRule({ id: "rule1", priority: 1 }),
      createTestRule({ id: "rule2", priority: 2 }),
    ];

    const router = new IntentRouter(customRules);
    expect(router.getRules()).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// ADD RULE & REMOVE RULE TESTS
// ═══════════════════════════════════════════════════════════════

describe("addRule & removeRule", () => {
  it("should add a custom rule to default rules", () => {
    const router = new IntentRouter();
    const initialCount = router.getRules().length;

    const customRule = createTestRule({
      id: "new-rule",
      priority: 25,
    });

    router.addRule(customRule);
    expect(router.getRules()).toHaveLength(initialCount + 1);
    expect(router.getRules().find(r => r.id === "new-rule")).toBeDefined();
  });

  it("should sort rules by priority after adding", () => {
    const router = new IntentRouter();

    const highPriority = createTestRule({
      id: "high-priority",
      priority: 1,
    });
    const lowPriority = createTestRule({
      id: "low-priority",
      priority: 100,
    });

    router.addRule(lowPriority);
    router.addRule(highPriority);

    const rules = router.getRules();
    const highIndex = rules.findIndex(r => r.id === "high-priority");
    const lowIndex = rules.findIndex(r => r.id === "low-priority");

    expect(highIndex).toBeLessThan(lowIndex);
  });

  it("should remove a rule by ID", () => {
    const router = new IntentRouter();
    const initialCount = router.getRules().length;

    router.removeRule("security-audit");

    const rules = router.getRules();
    expect(rules).toHaveLength(initialCount - 1);
    expect(rules.find(r => r.id === "security-audit")).toBeUndefined();
  });

  it("should remove custom rules", () => {
    const router = new IntentRouter();
    const customRule = createTestRule({
      id: "custom-removable",
      priority: 50,
    });

    router.addRule(customRule);
    expect(router.getRules().find(r => r.id === "custom-removable")).toBeDefined();

    router.removeRule("custom-removable");
    expect(router.getRules().find(r => r.id === "custom-removable")).toBeUndefined();
  });

  it("should keep custom rules integrated with defaults after rebuild", () => {
    const router = new IntentRouter();
    const customRule = createTestRule({
      id: "custom-integrated",
      priority: 3,
    });

    router.addRule(customRule);

    const rules = router.getRules();
    // Custom rule should be among defaults, sorted by priority
    expect(rules.find(r => r.id === "custom-integrated")).toBeDefined();
    // Should still have all defaults + custom
    expect(rules.length).toBe(14);
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTE() MATCHING TESTS
// ═══════════════════════════════════════════════════════════════

describe("route() - Keyword Matching", () => {
  it("should match security keywords to optimize-security", () => {
    const router = new IntentRouter();
    const result = router.route("I need a security vulnerability audit");

    expect(result.workflow).toBe("optimize-security");
    expect(result.matchedRule).toBe("security-audit");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("should match architecture keywords to diamond-discover", () => {
    const router = new IntentRouter();
    const result = router.route("Design a microservices architecture");

    expect(result.workflow).toBe("diamond-discover");
    expect(result.matchedRule).toBe("arch-review");
  });

  it("should match performance keywords to optimize-performance", () => {
    const router = new IntentRouter();
    const result = router.route("We have a memory leak causing latency");

    expect(result.workflow).toBe("optimize-performance");
    expect(result.matchedRule).toBe("performance");
  });

  it("should match debate keywords to crossfire-debate", () => {
    const router = new IntentRouter();
    const result = router.route("Compare pros and cons of microservices versus monolith");

    expect(result.workflow).toBe("crossfire-debate");
    expect(result.matchedRule).toBe("debate");
  });

  it("should respect anti-keywords and skip rule", () => {
    const router = new IntentRouter();
    // "develop" rule has anti-keywords ["spec", "plan", "research"]
    // So "implement based on spec" should NOT match "develop"
    const result = router.route("implement based on spec");

    expect(result.workflow).not.toBe("diamond-develop");
  });
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFY COMPLEXITY TESTS
// ═══════════════════════════════════════════════════════════════

describe("classifyComplexity", () => {
  it("should classify short prompts as trivial", () => {
    const router = new IntentRouter();
    expect(router.classifyComplexity("fix typo", 2)).toBe("trivial");
  });

  it("should classify prompts with trivial keywords as trivial", () => {
    const router = new IntentRouter();
    expect(router.classifyComplexity("simple rename the variable", 4)).toBe("trivial");
  });

  it("should classify prompts under 10 words as trivial", () => {
    const router = new IntentRouter();
    const shortPrompt = "one two three four five six seven eight nine";
    expect(router.classifyComplexity(shortPrompt, 9)).toBe("trivial");
  });

  it("should classify prompts with 2+ premium keywords as premium", () => {
    const router = new IntentRouter();
    const premiumPrompt = "Build a distributed consensus system with event sourcing";
    expect(router.classifyComplexity(premiumPrompt, 10)).toBe("premium");
  });

  it("should classify prompts over 80 words as premium", () => {
    const router = new IntentRouter();
    const longPrompt = Array(81).fill("word").join(" ");
    expect(router.classifyComplexity(longPrompt, 81)).toBe("premium");
  });

  it("should classify normal prompts as standard", () => {
    const router = new IntentRouter();
    expect(router.classifyComplexity("implement a new feature for our app that will help users track their projects", 14)).toBe("standard");
  });
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFY CYNEFIN TESTS
// ═══════════════════════════════════════════════════════════════

describe("classifyCynefin", () => {
  it("should classify trivial complexity as simple", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("any prompt", "trivial")).toBe("simple");
  });

  it("should classify incident/outage prompts as chaotic", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("We have a production outage", "standard")).toBe("chaotic");
  });

  it("should classify emergency prompts as chaotic", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("critical bug requiring emergency hotfix", "standard")).toBe("chaotic");
  });

  it("should classify distributed/consensus prompts as complex", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("design a distributed consensus algorithm", "standard")).toBe("complex");
  });

  it("should classify saga patterns as complex", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("implement a saga pattern", "standard")).toBe("complex");
  });

  it("should classify premium complexity as complicated", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("normal prompt", "premium")).toBe("complicated");
  });

  it("should default to simple for non-matching standard prompts", () => {
    const router = new IntentRouter();
    expect(router.classifyCynefin("build a simple feature", "standard")).toBe("simple");
  });
});

// ═══════════════════════════════════════════════════════════════
// DETECT RESPONSE MODE TESTS
// ═══════════════════════════════════════════════════════════════

describe("detectResponseMode", () => {
  it("should return direct for trivial complexity", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("any prompt", "trivial")).toBe("direct");
  });

  it("should return full for thorough keyword", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("I need a thorough analysis", "standard")).toBe("full");
  });

  it("should return full for comprehensive keyword", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("comprehensive code review needed", "standard")).toBe("full");
  });

  it("should return full for premium complexity", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("normal prompt", "premium")).toBe("full");
  });

  it("should return lightweight for quick keyword", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("Quick check of the code", "standard")).toBe("lightweight");
  });

  it("should return lightweight for brief keyword", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("Brief overview please", "standard")).toBe("lightweight");
  });

  it("should return standard for generic prompt", () => {
    const router = new IntentRouter();
    expect(router.detectResponseMode("review this code", "standard")).toBe("standard");
  });
});

// ═══════════════════════════════════════════════════════════════
// MATCH RULE TESTS
// ═══════════════════════════════════════════════════════════════

describe("matchRule - Advanced Filtering", () => {
  it("should filter by minComplexity", () => {
    const router = new IntentRouter();
    // Factory rule requires minComplexity: "standard"
    // Trivial prompts should not match it
    const result = router.route("simple fix", "trivial" as any);

    expect(result.workflow).not.toBe("factory-autonomous");
  });

  it("should filter by requiredContext", () => {
    const router = new IntentRouter();
    const customRule = createTestRule({
      id: "context-required",
      requiredContext: ["has-codebase", "has-tests"],
      keywords: ["test"],
      priority: 1,
    });

    router.addRule(customRule);

    // Without required context (context is undefined, so rule should skip)
    const resultNoContext = router.route("test this", undefined);
    expect(resultNoContext.matchedRule).not.toBe("context-required");

    // With required context
    const context = createTestContext({
      hasCodebase: true,
      hasTests: true,
    });
    const resultWithContext = router.route("test this", context);
    expect(resultWithContext.matchedRule).toBe("context-required");
  });

  it("should default to diamond-discover for research-like prompts", () => {
    const router = new IntentRouter();
    // Use a prompt that won't match any rule
    const result = router.route("xyzabc defghij klmnop", undefined);

    expect(result.workflow).toBe("diamond-discover");
    expect(result.confidence).toBe(0.3);
  });

  it("should default to diamond-develop for action-like prompts", () => {
    const router = new IntentRouter();
    // Remove "build" (matches develop rule) and use different action word that doesn't match rules
    const result = router.route("make something xyz abc", undefined);

    expect(result.workflow).toBe("diamond-develop");
    expect(result.confidence).toBe(0.3);
  });

  it("should calculate confidence based on matched keywords", () => {
    const router = new IntentRouter();
    const result = router.route("security vulnerability exploit found");

    // Multiple keyword matches should increase confidence
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});

// ═══════════════════════════════════════════════════════════════
// COST MULTIPLIER TESTS
// ═══════════════════════════════════════════════════════════════

describe("Cost Multipliers", () => {
  it("should set cost multiplier 0.1 for direct mode", () => {
    const router = new IntentRouter();
    const result = router.route("rename x");

    expect(result.responseMode).toBe("direct");
    expect(result.estimatedCostMultiplier).toBe(0.1);
  });

  it("should set cost multiplier 0.5 for lightweight mode", () => {
    const router = new IntentRouter();
    const result = router.route("quick review please");

    expect(result.responseMode).toBe("lightweight");
    expect(result.estimatedCostMultiplier).toBe(0.5);
  });

  it("should set cost multiplier 1.0 for standard mode", () => {
    const router = new IntentRouter();
    const result = router.route("can you review this code for me please and make sure it follows best practices");

    expect(result.responseMode).toBe("standard");
    expect(result.estimatedCostMultiplier).toBe(1.0);
  });

  it("should set cost multiplier 3.0 for full mode", () => {
    const router = new IntentRouter();
    const result = router.route("I need a thorough and comprehensive analysis");

    expect(result.responseMode).toBe("full");
    expect(result.estimatedCostMultiplier).toBe(3.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET WORKFLOWS FOR DOMAIN TESTS
// ═══════════════════════════════════════════════════════════════

describe("getWorkflowsForDomain", () => {
  it("should return simple workflows for simple domain", () => {
    const router = new IntentRouter();
    const workflows = router.getWorkflowsForDomain("simple");

    expect(workflows).toContain("quick-check");
    expect(workflows).toContain("diamond-develop");
  });

  it("should return complicated workflows for complicated domain", () => {
    const router = new IntentRouter();
    const workflows = router.getWorkflowsForDomain("complicated");

    expect(workflows).toContain("diamond-discover");
    expect(workflows).toContain("diamond-define");
    expect(workflows).toContain("diamond-develop");
    expect(workflows).toContain("diamond-deliver");
  });

  it("should return complex workflows for complex domain", () => {
    const router = new IntentRouter();
    const workflows = router.getWorkflowsForDomain("complex");

    expect(workflows).toContain("crossfire-debate");
    expect(workflows).toContain("knowledge-research");
    expect(workflows).toContain("diamond-discover");
  });

  it("should return chaotic workflows for chaotic domain", () => {
    const router = new IntentRouter();
    const workflows = router.getWorkflowsForDomain("chaotic");

    expect(workflows).toContain("factory-autonomous");
    expect(workflows).toContain("optimize-security");
    expect(workflows).toContain("quick-check");
  });

  it("should default to diamond-discover for unknown domain", () => {
    const router = new IntentRouter();
    // Cast to any to test unknown domain
    const workflows = router.getWorkflowsForDomain("unknown" as any);

    expect(workflows).toEqual(["diamond-discover"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════

describe("createIntentRouter factory", () => {
  it("should create a router with default rules", () => {
    const router = createIntentRouter();
    expect(router.getRules()).toHaveLength(13);
  });

  it("should add custom rules to factory-created router", () => {
    const customRules = [
      createTestRule({ id: "custom1", priority: 15 }),
      createTestRule({ id: "custom2", priority: 25 }),
    ];

    const router = createIntentRouter(customRules);
    const rules = router.getRules();

    expect(rules).toHaveLength(15);
    expect(rules.find(r => r.id === "custom1")).toBeDefined();
    expect(rules.find(r => r.id === "custom2")).toBeDefined();
  });

  it("should sort custom rules by priority in factory-created router", () => {
    const customRules = [
      createTestRule({ id: "low", priority: 100 }),
      createTestRule({ id: "high", priority: 1 }),
    ];

    const router = createIntentRouter(customRules);
    const rules = router.getRules();

    const highIndex = rules.findIndex(r => r.id === "high");
    const lowIndex = rules.findIndex(r => r.id === "low");

    expect(highIndex).toBeLessThan(lowIndex);
  });

  it("should allow routing on factory-created router", () => {
    const router = createIntentRouter();
    const result = router.route("security vulnerability found");

    expect(result.workflow).toBe("optimize-security");
    expect(result.complexity).toBeDefined();
    expect(result.cynefin).toBeDefined();
    expect(result.responseMode).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe("Integration - Full Routing Workflow", () => {
  it("should produce complete routing result with all fields", () => {
    const router = new IntentRouter();
    const result = router.route("We need to do a comprehensive security audit for PCI compliance");

    expect(result).toHaveProperty("workflow");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("complexity");
    expect(result).toHaveProperty("responseMode");
    expect(result).toHaveProperty("cynefin");
    expect(result).toHaveProperty("matchedRule");
    expect(result).toHaveProperty("suggestedTier");
    expect(result).toHaveProperty("estimatedCostMultiplier");
    expect(result).toHaveProperty("reasoning");

    // Verify types
    expect(typeof result.workflow).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should map complexity tier to suggested tier name", () => {
    const router = new IntentRouter();

    const trivialResult = router.route("rename x");
    expect(trivialResult.suggestedTier).toBe("mini");

    const standardResult = router.route("implement a new feature for the application system that will help manage tasks");
    expect(standardResult.suggestedTier).toBe("standard");

    const premiumResult = router.route("build distributed consensus system with event sourcing");
    expect(premiumResult.suggestedTier).toBe("premium");
  });

  it("should coordinate complexity, cynefin, and response mode", () => {
    const router = new IntentRouter();

    // Trivial should lead to simple Cynefin and direct response
    const trivialResult = router.route("fix typo");
    expect(trivialResult.complexity).toBe("trivial");
    expect(trivialResult.cynefin).toBe("simple");
    expect(trivialResult.responseMode).toBe("direct");

    // Premium + incident should be chaotic
    const chaosResult = router.route("production outage distributed system event sourcing");
    expect(chaosResult.cynefin).toBe("chaotic");
  });

  it("should handle context-dependent routing", () => {
    const router = new IntentRouter();
    const contextRule = createTestRule({
      id: "requires-pr",
      requiredContext: ["has-pr"],
      priority: 1,
      keywords: ["review"],
    });

    router.addRule(contextRule);

    // Without PR context (undefined context should cause rule to skip)
    const noPRResult = router.route("review code");
    expect(noPRResult.matchedRule).not.toBe("requires-pr");

    // With PR context
    const withPRResult = router.route("review code", createTestContext({ hasPR: true }));
    expect(withPRResult.matchedRule).toBe("requires-pr");
  });
});
