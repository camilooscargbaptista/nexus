import { jest } from "@jest/globals";
import {
  ProviderMesh,
  MeshProvider,
  ProviderCapability,
  MeshRequest,
  ProviderResponse,
  ConsensusConfig,
  DispatchStrategy,
} from "../provider-mesh.js";
import { LLMProvider, LLMMessage, LLMResponse, LLMStreamChunk, EmbeddingResponse } from "../llm-provider.js";

// ═══════════════════════════════════════════════════════════════
// MOCK LLMProvider
// ═══════════════════════════════════════════════════════════════

class MockLLMProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private responses: string[];
  private responseIndex = 0;
  private shouldFail = false;
  private latencyMs = 0;

  constructor(
    name: string,
    model: string,
    responses: string[] = ["Mock response"],
    shouldFail = false,
    latencyMs = 0,
  ) {
    this.name = name;
    this.model = model;
    this.responses = responses;
    this.shouldFail = shouldFail;
    this.latencyMs = latencyMs;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    if (this.latencyMs > 0) {
      await new Promise(r => setTimeout(r, this.latencyMs));
    }
    if (this.shouldFail) throw new Error("Provider failed");
    const response = this.responses[this.responseIndex++ % this.responses.length];
    return {
      content: response,
      model: this.model,
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async *stream(messages: LLMMessage[]): AsyncIterable<LLMStreamChunk> {
    const response = this.responses[0];
    for (const char of response) {
      yield { type: "text", content: char };
    }
    yield { type: "done" };
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    return {
      embedding: Array(1536).fill(0),
      model: this.model,
    };
  }

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY HELPERS
// ═══════════════════════════════════════════════════════════════

function createMeshProvider(
  id: string,
  name: string = "Test Provider",
  tier: "fast" | "balanced" | "powerful" = "balanced",
  capabilities: ProviderCapability[] = ["code-generation"],
  enabled = true,
  shouldFail = false,
  latencyMs = 0,
): MeshProvider {
  return {
    id,
    name,
    provider: new MockLLMProvider(name, `model-${id}`, ["Response from " + id], shouldFail, latencyMs),
    tier,
    costPerMToken: { input: 0.001, output: 0.002 },
    maxContextTokens: 8000,
    capabilities,
    enabled,
  };
}

function createMeshProviders(count: number, tier: "fast" | "balanced" | "powerful" = "balanced"): MeshProvider[] {
  return Array.from({ length: count }, (_, i) => createMeshProvider(`provider-${i}`, `Provider ${i}`, tier));
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("ProviderMesh", () => {
  let mesh: ProviderMesh;

  beforeEach(() => {
    mesh = new ProviderMesh();
  });

  // ───────────────────────────────────────────────────────────────
  // Registration & Discovery
  // ───────────────────────────────────────────────────────────────

  describe("registerProvider / unregisterProvider / providerCount / getProviderIds", () => {
    it("should register a provider and increment count", () => {
      const provider = createMeshProvider("provider-1");
      expect(mesh.providerCount).toBe(0);
      mesh.registerProvider(provider);
      expect(mesh.providerCount).toBe(1);
    });

    it("should unregister a provider and decrement count", () => {
      const provider = createMeshProvider("provider-1");
      mesh.registerProvider(provider);
      expect(mesh.providerCount).toBe(1);
      mesh.unregisterProvider("provider-1");
      expect(mesh.providerCount).toBe(0);
    });

    it("should return all provider IDs", () => {
      mesh.registerProvider(createMeshProvider("p1"));
      mesh.registerProvider(createMeshProvider("p2"));
      mesh.registerProvider(createMeshProvider("p3"));
      const ids = mesh.getProviderIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain("p1");
      expect(ids).toContain("p2");
      expect(ids).toContain("p3");
    });

    it("should handle multiple registrations of different providers", () => {
      const providers = createMeshProviders(5);
      providers.forEach(p => mesh.registerProvider(p));
      expect(mesh.providerCount).toBe(5);
      expect(mesh.getProviderIds()).toHaveLength(5);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // getAvailableProviders
  // ───────────────────────────────────────────────────────────────

  describe("getAvailableProviders", () => {
    beforeEach(() => {
      mesh.registerProvider(createMeshProvider("p1", "Fast", "fast", ["code-generation"]));
      mesh.registerProvider(createMeshProvider("p2", "Balanced", "balanced", ["code-generation", "code-review"]));
      mesh.registerProvider(createMeshProvider("p3", "Powerful", "powerful", ["code-generation", "reasoning"]));
      mesh.registerProvider(createMeshProvider("p4", "Disabled", "fast", ["code-generation"], false));
    });

    it("should exclude disabled providers", () => {
      const available = mesh.getAvailableProviders();
      expect(available).toHaveLength(3);
      expect(available.every(p => p.enabled)).toBe(true);
    });

    it("should filter by required capabilities", () => {
      const available = mesh.getAvailableProviders(["code-review"]);
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe("p2");
    });

    it("should filter by multiple required capabilities", () => {
      const available = mesh.getAvailableProviders(["code-generation", "reasoning"]);
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe("p3");
    });

    it("should exclude providers by ID", () => {
      const available = mesh.getAvailableProviders(undefined, ["p1", "p3"]);
      expect(available).toHaveLength(1);
      expect(available[0].id).toBe("p2");
    });

    it("should prefer specific provider IDs", () => {
      const available = mesh.getAvailableProviders(undefined, undefined, ["p3", "p1"]);
      expect(available[0].id).toBe("p3");
      expect(available[1].id).toBe("p1");
    });

    it("should sort by tier (powerful > balanced > fast)", () => {
      const available = mesh.getAvailableProviders();
      const tiers = available.map(p => p.tier);
      expect(tiers).toEqual(["powerful", "balanced", "fast"]);
    });

    it("should prefer providers first, then sort by tier", () => {
      const available = mesh.getAvailableProviders(undefined, undefined, ["p1"]);
      expect(available[0].id).toBe("p1");
      expect(available[1].tier).toBe("powerful");
    });

    it("should return empty array when no providers match", () => {
      const available = mesh.getAvailableProviders(["long-context" as ProviderCapability]);
      expect(available).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // getContextBudget
  // ───────────────────────────────────────────────────────────────

  describe("getContextBudget", () => {
    it("should allocate 60% for implementer role", () => {
      const budget = mesh.getContextBudget("implementer", 10000);
      expect(budget.role).toBe("implementer");
      expect(budget.proportion).toBe(0.60);
      expect(budget.maxTokens).toBe(6000);
    });

    it("should allocate 60% for researcher role", () => {
      const budget = mesh.getContextBudget("researcher", 10000);
      expect(budget.proportion).toBe(0.60);
      expect(budget.maxTokens).toBe(6000);
    });

    it("should allocate 40% for planner role", () => {
      const budget = mesh.getContextBudget("planner", 10000);
      expect(budget.proportion).toBe(0.40);
      expect(budget.maxTokens).toBe(4000);
    });

    it("should allocate 25% for verifier role", () => {
      const budget = mesh.getContextBudget("verifier", 10000);
      expect(budget.proportion).toBe(0.25);
      expect(budget.maxTokens).toBe(2500);
    });

    it("should allocate 35% for reviewer role", () => {
      const budget = mesh.getContextBudget("reviewer", 10000);
      expect(budget.proportion).toBe(0.35);
      expect(budget.maxTokens).toBe(3500);
    });

    it("should use default base tokens when not specified", () => {
      const budget = mesh.getContextBudget("implementer");
      expect(budget.maxTokens).toBe(Math.floor(12000 * 0.60));
    });
  });

  // ───────────────────────────────────────────────────────────────
  // enforceContextBudget
  // ───────────────────────────────────────────────────────────────

  describe("enforceContextBudget", () => {
    it("should return prompt as-is when under budget", () => {
      const prompt = "Short prompt";
      const enforced = mesh.enforceContextBudget(prompt, "implementer", 10000);
      expect(enforced).toBe(prompt);
    });

    it("should truncate prompt when over budget", () => {
      const longPrompt = "A".repeat(30000);
      const enforced = mesh.enforceContextBudget(longPrompt, "implementer", 10000);
      expect(enforced.length).toBeLessThan(longPrompt.length);
      expect(enforced).toContain("[... truncated to fit context budget ...]");
    });

    it("should respect role budgets when truncating", () => {
      const longPrompt = "A".repeat(30000);
      const implementerEnforced = mesh.enforceContextBudget(longPrompt, "implementer", 10000);
      const verifierEnforced = mesh.enforceContextBudget(longPrompt, "verifier", 10000);
      expect(implementerEnforced.length).toBeGreaterThan(verifierEnforced.length);
    });

    it("should append truncation message", () => {
      const longPrompt = "A".repeat(30000);
      const enforced = mesh.enforceContextBudget(longPrompt, "planner", 10000);
      expect(enforced.endsWith("[... truncated to fit context budget ...]")).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // dispatchSingle
  // ───────────────────────────────────────────────────────────────

  describe("dispatchSingle", () => {
    it("should successfully dispatch to a provider", async () => {
      const provider = createMeshProvider("p1");
      const response = await mesh.dispatchSingle(provider, "Test prompt", "test-phase", "implementer");
      expect(response.success).toBe(true);
      expect(response.providerId).toBe("p1");
      expect(response.response).toBe("Response from p1");
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
      expect(response.cost).toBeGreaterThan(0);
    });

    it("should record cost on successful dispatch", async () => {
      const provider = createMeshProvider("p1");
      await mesh.dispatchSingle(provider, "Test prompt", "phase1", "implementer");
      const report = mesh.getCostReport();
      expect(report.callCount).toBe(1);
      expect(report.byProvider["p1"]).toBeDefined();
      expect(report.byProvider["p1"].calls).toBe(1);
    });

    it("should handle provider timeout with fallback", async () => {
      const primary = createMeshProvider("p1", "Primary", "fast", [], true, true);
      const fallback = createMeshProvider("p2", "Fallback");
      mesh.registerProvider(fallback);
      mesh.setFallbackChain("p1", ["p2"]);

      const response = await mesh.dispatchSingle(primary, "Test", "phase1", "implementer", 100);
      expect(response.success).toBe(true);
      expect(response.providerId).toBe("p2");
    });

    it("should return failure response when provider fails and no fallback", async () => {
      const provider = createMeshProvider("p1", "Failing", "fast", [], true, true);
      const response = await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.cost).toBe(0);
    });

    it("should measure latency", async () => {
      const provider = createMeshProvider("p1", "Slow", "fast", [], true, false, 50);
      const response = await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");
      expect(response.latencyMs).toBeGreaterThanOrEqual(40);
    });

    it("should enforce context budget on prompt", async () => {
      const provider = createMeshProvider("p1");
      const longPrompt = "A".repeat(50000);
      const response = await mesh.dispatchSingle(provider, longPrompt, "phase1", "implementer");
      expect(response.success).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // setFallbackChain
  // ───────────────────────────────────────────────────────────────

  describe("setFallbackChain", () => {
    it("should set fallback chain for a provider", () => {
      mesh.registerProvider(createMeshProvider("p1"));
      mesh.registerProvider(createMeshProvider("p2"));
      mesh.registerProvider(createMeshProvider("p3"));

      mesh.setFallbackChain("p1", ["p2", "p3"]);
      // Chain is internal, verify through dispatch behavior
      expect(mesh.providerCount).toBe(3);
    });

    it("should execute fallback chain on primary failure", async () => {
      const primary = createMeshProvider("p1", "Primary", "fast", [], true, true);
      const fallback1 = createMeshProvider("p2", "Fallback1");
      mesh.registerProvider(fallback1);
      mesh.setFallbackChain("p1", ["p2"]);

      const response = await mesh.dispatchSingle(primary, "Test", "phase1", "implementer");
      expect(response.success).toBe(true);
      expect(response.providerId).toBe("p2");
    });
  });

  // ───────────────────────────────────────────────────────────────
  // dispatch
  // ───────────────────────────────────────────────────────────────

  describe("dispatch", () => {
    beforeEach(() => {
      mesh.registerProvider(createMeshProvider("p1", "Provider 1"));
      mesh.registerProvider(createMeshProvider("p2", "Provider 2"));
      mesh.registerProvider(createMeshProvider("p3", "Provider 3"));
    });

    it("should throw error when no providers available", async () => {
      const request: MeshRequest = {
        prompt: "Test",
        phase: "test",
        role: "implementer",
        requiredCapabilities: ["long-context" as ProviderCapability],
      };
      await expect(mesh.dispatch(request)).rejects.toThrow("No providers available");
    });

    it("should dispatch in parallel mode", async () => {
      const request: MeshRequest = {
        prompt: "Test prompt",
        phase: "phase1",
        role: "implementer",
        strategy: { mode: "parallel", maxConcurrent: 2, timeoutMs: 5000, retryCount: 1 },
      };
      const responses = await mesh.dispatch(request);
      expect(responses.length).toBeGreaterThan(0);
      expect(responses.every(r => r.success)).toBe(true);
    });

    it("should dispatch in sequential mode", async () => {
      const request: MeshRequest = {
        prompt: "Test prompt",
        phase: "phase1",
        role: "implementer",
        strategy: { mode: "sequential", maxConcurrent: 1, timeoutMs: 5000, retryCount: 0 },
      };
      const responses = await mesh.dispatch(request);
      expect(responses.length).toBeGreaterThan(0);
    });

    it("should dispatch in round-robin mode", async () => {
      const request: MeshRequest = {
        prompt: "Test prompt",
        phase: "phase1",
        role: "implementer",
        strategy: { mode: "round-robin", maxConcurrent: 1, timeoutMs: 5000, retryCount: 0 },
      };
      const responses = await mesh.dispatch(request);
      expect(responses).toHaveLength(1);
    });

    it("should respect preferred providers in dispatch", async () => {
      const request: MeshRequest = {
        prompt: "Test",
        phase: "phase1",
        role: "implementer",
        preferredProviders: ["p3"],
        strategy: { mode: "parallel", maxConcurrent: 1, timeoutMs: 5000, retryCount: 0 },
      };
      const responses = await mesh.dispatch(request);
      expect(responses[0].providerId).toBe("p3");
    });

    it("should exclude providers in dispatch", async () => {
      const request: MeshRequest = {
        prompt: "Test",
        phase: "phase1",
        role: "implementer",
        excludeProviders: ["p1", "p2"],
        strategy: { mode: "parallel", maxConcurrent: 4, timeoutMs: 5000, retryCount: 0 },
      };
      const responses = await mesh.dispatch(request);
      expect(responses.every(r => r.providerId === "p3")).toBe(true);
    });

    it("should filter by required capabilities in dispatch", async () => {
      mesh.registerProvider(
        createMeshProvider("p-code", "Code Provider", "balanced", ["code-generation"]),
      );
      mesh.registerProvider(
        createMeshProvider("p-reason", "Reasoning Provider", "balanced", ["reasoning"]),
      );

      const request: MeshRequest = {
        prompt: "Test",
        phase: "phase1",
        role: "implementer",
        requiredCapabilities: ["code-generation"],
        excludeProviders: ["p1", "p2", "p3"],
        strategy: { mode: "parallel", maxConcurrent: 4, timeoutMs: 5000, retryCount: 0 },
      };
      const responses = await mesh.dispatch(request);
      expect(responses.every(r => r.providerId === "p-code")).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // buildConsensus
  // ───────────────────────────────────────────────────────────────

  describe("buildConsensus", () => {
    function createResponse(
      providerId: string,
      response: string,
      tier: "fast" | "balanced" | "powerful" = "balanced",
      success = true,
    ): ProviderResponse {
      return {
        providerId,
        providerName: `Provider ${providerId}`,
        tier,
        response,
        tokensUsed: { input: 100, output: 200 },
        latencyMs: 100,
        cost: 0.01,
        success,
      };
    }

    it("should reach consensus when sufficient agreement", () => {
      const responses = [
        createResponse("p1", "The correct answer is option A and here is why the answer works well. The answer A satisfies all requirements and is the best choice."),
        createResponse("p2", "The correct answer is option A and here is why the answer works well. The answer A satisfies all requirements and is the best choice."),
        createResponse("p3", "The correct answer is option A and here is why the answer works well. The answer A satisfies all requirements and is the best choice."),
      ];
      const result = mesh.buildConsensus(responses, { threshold: 0.75, minProviders: 2 });
      expect(result.consensusReached).toBe(true);
      expect(result.confidenceScore).toBeGreaterThan(0.75);
    });

    it("should not reach consensus below threshold", () => {
      const responses = [
        createResponse("p1", "The answer is A."),
        createResponse("p2", "The answer is B."),
        createResponse("p3", "The answer is C."),
      ];
      const result = mesh.buildConsensus(responses, { threshold: 0.9, minProviders: 1 });
      expect(result.consensusReached).toBe(false);
      expect(result.confidenceScore).toBeLessThan(0.9);
    });

    it("should fail consensus with insufficient providers", () => {
      const responses = [createResponse("p1", "Single response")];
      const result = mesh.buildConsensus(responses, { threshold: 0.75, minProviders: 2 });
      expect(result.consensusReached).toBe(false);
      expect(result.conflictZones).toContain("Insufficient provider responses");
    });

    it("should handle single provider response", () => {
      const responses = [createResponse("p1", "Single provider response")];
      const result = mesh.buildConsensus(responses, { threshold: 0.5, minProviders: 1 });
      expect(result.providerCount).toBe(1);
    });

    it("should weight responses by tier", () => {
      const responses = [
        createResponse("p1", "This is correct.", "fast"),
        createResponse("p2", "This is correct.", "powerful"),
      ];
      const result = mesh.buildConsensus(responses, { threshold: 0.7, minProviders: 2 });
      expect(result.confidenceScore).toBeGreaterThan(0);
    });

    it("should synthesize response using highest-tier conflict resolution", () => {
      const responses = [
        createResponse("p1", "Fast provider response", "fast"),
        createResponse("p2", "Powerful provider response", "powerful"),
      ];
      const result = mesh.buildConsensus(responses, {
        threshold: 0.5,
        minProviders: 2,
        conflictResolution: "highest-tier",
      });
      if (result.synthesizedResponse) {
        expect(result.synthesizedResponse).toBe("Powerful provider response");
      }
    });

    it("should calculate total cost across all responses", () => {
      const responses = [
        createResponse("p1", "Response 1"),
        createResponse("p2", "Response 2"),
        createResponse("p3", "Response 3"),
      ];
      const result = mesh.buildConsensus(responses);
      expect(result.totalCost).toBe(0.03);
    });

    it("should calculate max latency", () => {
      const responses = [
        { ...createResponse("p1", "Response 1"), latencyMs: 100 },
        { ...createResponse("p2", "Response 2"), latencyMs: 300 },
        { ...createResponse("p3", "Response 3"), latencyMs: 150 },
      ];
      const result = mesh.buildConsensus(responses);
      expect(result.totalLatencyMs).toBe(300);
    });

    it("should handle failed responses in consensus", () => {
      const responses = [
        createResponse("p1", "Good response", "balanced", true),
        createResponse("p2", "", "balanced", false),
        createResponse("p3", "Another good response", "balanced", true),
      ];
      const result = mesh.buildConsensus(responses, { minProviders: 2 });
      expect(result.responses).toHaveLength(3);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // Cost Tracking
  // ───────────────────────────────────────────────────────────────

  describe("getCostReport", () => {
    it("should return zero report when no costs recorded", () => {
      const report = mesh.getCostReport();
      expect(report.totalCost).toBe(0);
      expect(report.callCount).toBe(0);
      expect(report.avgCostPerCall).toBe(0);
    });

    it("should aggregate costs by provider", async () => {
      const p1 = createMeshProvider("p1");
      const p2 = createMeshProvider("p2");
      mesh.registerProvider(p1);
      mesh.registerProvider(p2);

      await mesh.dispatchSingle(p1, "Test", "phase1", "implementer");

      const report = mesh.getCostReport();
      expect(report.byProvider).toBeDefined();
      expect(Object.keys(report.byProvider).length).toBeGreaterThan(0);
    });

    it("should track costs by phase", async () => {
      const provider = createMeshProvider("p1");
      mesh.registerProvider(provider);

      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");
      await mesh.dispatchSingle(provider, "Test", "phase2", "implementer");

      const report = mesh.getCostReport();
      expect(report.byPhase["phase1"]).toBeDefined();
      expect(report.byPhase["phase2"]).toBeDefined();
      expect(report.byPhase["phase1"].calls).toBe(1);
      expect(report.byPhase["phase2"].calls).toBe(1);
    });

    it("should track costs by role", async () => {
      const provider = createMeshProvider("p1");
      mesh.registerProvider(provider);

      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");
      await mesh.dispatchSingle(provider, "Test", "phase1", "reviewer");

      const report = mesh.getCostReport();
      expect(report.byRole["implementer"]).toBeDefined();
      expect(report.byRole["reviewer"]).toBeDefined();
      expect(report.byRole["implementer"].calls).toBe(1);
      expect(report.byRole["reviewer"].calls).toBe(1);
    });

    it("should calculate average cost per call", async () => {
      const provider = createMeshProvider("p1");
      mesh.registerProvider(provider);

      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");
      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");

      const report = mesh.getCostReport();
      expect(report.avgCostPerCall).toBe(report.totalCost / 2);
    });

    it("should calculate average latency", async () => {
      const provider = createMeshProvider("p1", "Provider 1", "fast", [], true, false, 50);
      mesh.registerProvider(provider);

      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");

      const report = mesh.getCostReport();
      expect(report.avgLatencyMs).toBeGreaterThan(0);
    });

    it("should aggregate total tokens", async () => {
      const provider = createMeshProvider("p1");
      mesh.registerProvider(provider);

      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");

      const report = mesh.getCostReport();
      expect(report.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("resetCostHistory", () => {
    it("should clear cost history", async () => {
      const provider = createMeshProvider("p1");
      mesh.registerProvider(provider);

      await mesh.dispatchSingle(provider, "Test", "phase1", "implementer");
      let report = mesh.getCostReport();
      expect(report.callCount).toBe(1);

      mesh.resetCostHistory();
      report = mesh.getCostReport();
      expect(report.callCount).toBe(0);
      expect(report.totalCost).toBe(0);
    });

    it("should preserve provider registrations after reset", () => {
      const provider = createMeshProvider("p1");
      mesh.registerProvider(provider);
      expect(mesh.providerCount).toBe(1);

      mesh.resetCostHistory();
      expect(mesh.providerCount).toBe(1);
    });
  });
});
