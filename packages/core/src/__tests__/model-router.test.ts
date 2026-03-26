/**
 * Tests for Model Router
 */

import { ModelRouter, inferTaskProfile } from "../model-router.js";
import type { TaskProfile, ModelTier, ModelRouterConfig } from "../model-router.js";
import type { LLMProvider, LLMResponse, LLMMessage, LLMStreamChunk } from "../llm-provider.js";

// ─── Mock Provider ────────────────────────────────────────────

function makeMockProvider(name: string, model: string): LLMProvider {
  return {
    name,
    model,
    chat: async () => ({
      content: `Response from ${name}`,
      model,
      finishReason: "stop" as const,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    }),
    stream: async function* (): AsyncIterable<LLMStreamChunk> {
      yield { type: "text", content: "streamed" };
      yield { type: "done" };
    },
    embed: async () => ({ embedding: [0.1, 0.2], model, usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 } }),
    healthCheck: async () => true,
  };
}

const fastProvider = makeMockProvider("haiku", "claude-haiku");
const balancedProvider = makeMockProvider("sonnet", "claude-sonnet");
const powerfulProvider = makeMockProvider("opus", "claude-opus");

function makeRouter(overrides: Partial<ModelRouterConfig> = {}): ModelRouter {
  return new ModelRouter({
    fast: fastProvider,
    balanced: balancedProvider,
    powerful: powerfulProvider,
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe("ModelRouter", () => {
  test("routes exploration tasks to fast tier", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "file-scan",
      type: "exploration",
      complexity: "low",
    });
    expect(decision.tier).toBe("fast");
    expect(decision.provider).toBe(fastProvider);
  });

  test("routes quick-check tasks to fast tier", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "lint",
      type: "quick-check",
      complexity: "low",
    });
    expect(decision.tier).toBe("fast");
  });

  test("routes code-review to balanced tier", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "review",
      type: "code-review",
      complexity: "medium",
    });
    expect(decision.tier).toBe("balanced");
  });

  test("routes architecture tasks to powerful tier", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "arch-review",
      type: "architecture",
      complexity: "high",
    });
    expect(decision.tier).toBe("powerful");
    expect(decision.provider).toBe(powerfulProvider);
  });

  test("routes decision tasks to powerful tier", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "adr",
      type: "decision",
      complexity: "high",
    });
    expect(decision.tier).toBe("powerful");
  });

  test("critical findings upgrade to powerful tier", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "scan",
      type: "exploration",
      complexity: "low",
      hasCriticalFindings: true,
    });
    expect(decision.tier).toBe("powerful");
  });

  test("tier override bypasses routing logic", () => {
    const router = makeRouter();
    const decision = router.route({
      name: "scan",
      type: "architecture",
      complexity: "high",
      tierOverride: "fast",
    });
    expect(decision.tier).toBe("fast");
    expect(decision.reason).toContain("Manual override");
  });

  test("disableRouting always uses balanced", () => {
    const router = makeRouter({ disableRouting: true });
    const decision = router.route({
      name: "arch",
      type: "architecture",
      complexity: "high",
    });
    expect(decision.tier).toBe("balanced");
  });

  test("large context upgrades fast to balanced", () => {
    const router = makeRouter({ contextUpgradeThreshold: 10_000 });
    const decision = router.route({
      name: "scan",
      type: "exploration",
      complexity: "low",
      contextSize: 50_000,
    });
    expect(decision.tier).toBe("balanced");
  });

  test("security analysis routes to balanced (standard) or powerful (complex)", () => {
    const router = makeRouter();

    const standard = router.route({
      name: "sec-scan",
      type: "security-analysis",
      complexity: "medium",
    });
    expect(standard.tier).toBe("balanced");

    const complex = router.route({
      name: "sec-deep",
      type: "security-analysis",
      complexity: "high",
    });
    expect(complex.tier).toBe("powerful");
  });

  test("chat executes through routed provider", async () => {
    const router = makeRouter();
    const messages: LLMMessage[] = [{ role: "user", content: "analyze" }];

    const { response, routing } = await router.chat(
      { name: "scan", type: "exploration", complexity: "low" },
      messages,
    );

    expect(response.content).toContain("haiku");
    expect(routing.tier).toBe("fast");
  });

  test("tracks routing statistics", () => {
    const router = makeRouter();

    router.route({ name: "a", type: "exploration", complexity: "low" });
    router.route({ name: "b", type: "architecture", complexity: "high" });
    router.route({ name: "c", type: "code-review", complexity: "medium" });

    const stats = router.getStats();
    expect(stats.totalRouted).toBe(3);
    expect(stats.byTier.fast).toBe(1);
    expect(stats.byTier.powerful).toBe(1);
    expect(stats.byTier.balanced).toBe(1);
    expect(stats.byTaskType["exploration"]).toBe(1);
    expect(stats.byTaskType["architecture"]).toBe(1);
  });

  test("cost multiplier is correct per tier", () => {
    const router = makeRouter();

    const fast = router.route({ name: "a", type: "exploration", complexity: "low" });
    const balanced = router.route({ name: "b", type: "code-review", complexity: "medium" });
    const powerful = router.route({ name: "c", type: "architecture", complexity: "high" });

    expect(fast.estimatedCostMultiplier).toBe(0.1);
    expect(balanced.estimatedCostMultiplier).toBe(1.0);
    expect(powerful.estimatedCostMultiplier).toBe(5.0);
  });

  test("resetStats clears all statistics", () => {
    const router = makeRouter();
    router.route({ name: "a", type: "exploration", complexity: "low" });
    router.resetStats();

    const stats = router.getStats();
    expect(stats.totalRouted).toBe(0);
  });

  test("falls back to balanced when fast/powerful not provided", () => {
    const router = new ModelRouter({ balanced: balancedProvider });

    const fast = router.route({ name: "a", type: "exploration", complexity: "low" });
    expect(fast.provider).toBe(balancedProvider);

    const powerful = router.route({ name: "b", type: "architecture", complexity: "high" });
    expect(powerful.provider).toBe(balancedProvider);
  });

  test("custom rules take effect by priority", () => {
    const router = makeRouter({
      customRules: [{
        name: "always-fast",
        match: (t) => t.name === "special",
        tier: "fast",
        priority: 200, // higher than all defaults
      }],
    });

    const decision = router.route({
      name: "special",
      type: "architecture",
      complexity: "high",
    });
    expect(decision.tier).toBe("fast");
    expect(decision.rule).toBe("always-fast");
  });
});

describe("inferTaskProfile", () => {
  test("infers security profile from skill name", () => {
    const profile = inferTaskProfile("security-review");
    expect(profile.type).toBe("security-analysis");
  });

  test("infers architecture profile", () => {
    const profile = inferTaskProfile("architecture-review");
    expect(profile.type).toBe("architecture");
    expect(profile.complexity).toBe("high");
  });

  test("infers decision profile from ADR", () => {
    const profile = inferTaskProfile("adr");
    expect(profile.type).toBe("decision");
  });

  test("infers remediation profile", () => {
    const profile = inferTaskProfile("auto-fix-engine");
    expect(profile.type).toBe("remediation");
  });

  test("passes through options", () => {
    const profile = inferTaskProfile("security-scan", {
      hasCriticalFindings: true,
      contextSize: 25000,
    });
    expect(profile.hasCriticalFindings).toBe(true);
    expect(profile.contextSize).toBe(25000);
  });

  test("defaults to code-review for unknown skills", () => {
    const profile = inferTaskProfile("mystery-skill");
    expect(profile.type).toBe("code-review");
    expect(profile.complexity).toBe("medium");
  });
});
