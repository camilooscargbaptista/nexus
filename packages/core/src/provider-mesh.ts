/**
 * ProviderMesh — Multi-LLM orchestration with consensus, fallback, and cost tracking
 *
 * Inspired by claude-octopus dispatch.sh + cost.sh.
 * Coordinates N providers in parallel, builds consensus, tracks costs.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { LLMProvider, LLMResponse } from "./llm-provider.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MeshProvider {
  id: string;
  name: string;
  provider: LLMProvider;
  tier: "fast" | "balanced" | "powerful";
  costPerMToken: { input: number; output: number };
  maxContextTokens: number;
  capabilities: ProviderCapability[];
  enabled: boolean;
}

export type ProviderCapability =
  | "code-generation" | "code-review" | "security-analysis"
  | "architecture" | "research" | "reasoning" | "web-search"
  | "image-understanding" | "long-context";

export interface DispatchStrategy {
  mode: "parallel" | "sequential" | "fan-out" | "round-robin";
  maxConcurrent: number;
  timeoutMs: number;
  retryCount: number;
}

export interface ConsensusConfig {
  threshold: number;          // 0.0-1.0, default 0.75
  minProviders: number;       // minimum providers that must respond
  scoringMethod: "majority" | "weighted" | "unanimous";
  conflictResolution: "highest-tier" | "synthesize" | "abort";
}

export interface ContextBudget {
  role: ProviderRole;
  maxTokens: number;
  proportion: number;  // 0.0-1.0
}

export type ProviderRole = "implementer" | "verifier" | "researcher" | "planner" | "reviewer";

export interface MeshRequest {
  prompt: string;
  phase: string;
  role: ProviderRole;
  requiredCapabilities?: ProviderCapability[];
  preferredProviders?: string[];
  excludeProviders?: string[];
  strategy?: Partial<DispatchStrategy>;
  consensus?: Partial<ConsensusConfig>;
}

export interface ProviderResponse {
  providerId: string;
  providerName: string;
  tier: string;
  response: string;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
  cost: number;
  success: boolean;
  error?: string;
}

export interface ConsensusResult {
  responses: ProviderResponse[];
  consensusReached: boolean;
  confidenceScore: number;       // 0.0-1.0
  agreementZones: string[];      // areas of agreement
  conflictZones: string[];       // areas of disagreement
  synthesizedResponse?: string;  // merged best response
  totalCost: number;
  totalLatencyMs: number;
  providerCount: number;
}

export interface CostRecord {
  providerId: string;
  phase: string;
  role: ProviderRole;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  timestamp: Date;
}

export interface CostReport {
  totalCost: number;
  totalTokens: number;
  byProvider: Record<string, { cost: number; calls: number; tokens: number }>;
  byPhase: Record<string, { cost: number; calls: number }>;
  byRole: Record<string, { cost: number; calls: number }>;
  avgCostPerCall: number;
  avgLatencyMs: number;
  callCount: number;
}

// ═══════════════════════════════════════════════════════════════
// ROLE BUDGETS (from Octopus)
// ═══════════════════════════════════════════════════════════════

const ROLE_BUDGET_PROPORTIONS: Record<ProviderRole, number> = {
  implementer: 0.60,
  researcher: 0.60,
  planner: 0.40,
  verifier: 0.25,
  reviewer: 0.35,
};

// ═══════════════════════════════════════════════════════════════
// PROVIDER MESH
// ═══════════════════════════════════════════════════════════════

export class ProviderMesh {
  private providers: Map<string, MeshProvider> = new Map();
  private costHistory: CostRecord[] = [];
  private fallbackChains: Map<string, string[]> = new Map();

  private defaultStrategy: DispatchStrategy = {
    mode: "parallel",
    maxConcurrent: 4,
    timeoutMs: 30000,
    retryCount: 1,
  };

  private defaultConsensus: ConsensusConfig = {
    threshold: 0.75,
    minProviders: 2,
    scoringMethod: "weighted",
    conflictResolution: "highest-tier",
  };

  /** Register a provider in the mesh */
  registerProvider(provider: MeshProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Remove a provider */
  unregisterProvider(id: string): void {
    this.providers.delete(id);
  }

  /** Set fallback chain: if primary fails, try fallbacks in order */
  setFallbackChain(primaryId: string, fallbackIds: string[]): void {
    this.fallbackChains.set(primaryId, fallbackIds);
  }

  /** Get available providers matching requirements */
  getAvailableProviders(
    capabilities?: ProviderCapability[],
    excludeIds?: string[],
    preferIds?: string[],
  ): MeshProvider[] {
    let available = [...this.providers.values()].filter(p => p.enabled);

    if (capabilities?.length) {
      available = available.filter(p =>
        capabilities.every(c => p.capabilities.includes(c)),
      );
    }

    if (excludeIds?.length) {
      available = available.filter(p => !excludeIds.includes(p.id));
    }

    // Sort: preferred first, then by tier (powerful > balanced > fast)
    const tierOrder = { powerful: 0, balanced: 1, fast: 2 };
    available.sort((a, b) => {
      const aPreferred = preferIds?.includes(a.id) ? -1 : 0;
      const bPreferred = preferIds?.includes(b.id) ? -1 : 0;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      return tierOrder[a.tier] - tierOrder[b.tier];
    });

    return available;
  }

  /** Calculate context budget for a role */
  getContextBudget(role: ProviderRole, baseTokens: number = 12000): ContextBudget {
    const proportion = ROLE_BUDGET_PROPORTIONS[role] ?? 0.40;
    return {
      role,
      maxTokens: Math.floor(baseTokens * proportion),
      proportion,
    };
  }

  /** Truncate prompt to fit context budget */
  enforceContextBudget(prompt: string, role: ProviderRole, baseTokens: number = 12000): string {
    const budget = this.getContextBudget(role, baseTokens);
    const charBudget = budget.maxTokens * 4; // ~4 chars per token
    if (prompt.length <= charBudget) return prompt;
    return prompt.slice(0, charBudget) + "\n\n[... truncated to fit context budget ...]";
  }

  /** Dispatch request to a single provider with fallback */
  async dispatchSingle(
    provider: MeshProvider,
    prompt: string,
    phase: string,
    role: ProviderRole,
    timeoutMs: number = 30000,
  ): Promise<ProviderResponse> {
    const start = Date.now();
    const budgetedPrompt = this.enforceContextBudget(prompt, role, provider.maxContextTokens);

    try {
      const response = await Promise.race([
        provider.provider.chat([{ role: "user", content: budgetedPrompt }]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeoutMs),
        ),
      ]) as LLMResponse;

      const latencyMs = Date.now() - start;
      const tokensUsed = {
        input: response.usage?.inputTokens ?? Math.ceil(budgetedPrompt.length / 4),
        output: response.usage?.outputTokens ?? Math.ceil((response.content?.length ?? 0) / 4),
      };
      const cost = this.calculateCost(provider, tokensUsed.input, tokensUsed.output);

      this.recordCost(provider.id, phase, role, tokensUsed.input, tokensUsed.output, cost, latencyMs);

      return {
        providerId: provider.id,
        providerName: provider.name,
        tier: provider.tier,
        response: response.content ?? "",
        tokensUsed,
        latencyMs,
        cost,
        success: true,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      // Try fallback chain
      const fallbacks = this.fallbackChains.get(provider.id) || [];
      for (const fallbackId of fallbacks) {
        const fallback = this.providers.get(fallbackId);
        if (fallback?.enabled) {
          return this.dispatchSingle(fallback, prompt, phase, role, timeoutMs);
        }
      }

      return {
        providerId: provider.id,
        providerName: provider.name,
        tier: provider.tier,
        response: "",
        tokensUsed: { input: 0, output: 0 },
        latencyMs,
        cost: 0,
        success: false,
        error: err.message,
      };
    }
  }

  /** Dispatch to multiple providers based on strategy */
  async dispatch(request: MeshRequest): Promise<ProviderResponse[]> {
    const strategy = { ...this.defaultStrategy, ...request.strategy };
    const providers = this.getAvailableProviders(
      request.requiredCapabilities,
      request.excludeProviders,
      request.preferredProviders,
    );

    if (providers.length === 0) {
      throw new Error("No providers available matching requirements");
    }

    if (strategy.mode === "parallel" || strategy.mode === "fan-out") {
      return this.dispatchParallel(providers, request, strategy);
    } else if (strategy.mode === "sequential") {
      return this.dispatchSequential(providers, request, strategy);
    } else {
      // round-robin: pick one
      const idx = this.costHistory.length % providers.length;
      const result = await this.dispatchSingle(
        providers[idx], request.prompt, request.phase, request.role, strategy.timeoutMs,
      );
      return [result];
    }
  }

  /** Dispatch to all providers in parallel with concurrency limit */
  private async dispatchParallel(
    providers: MeshProvider[],
    request: MeshRequest,
    strategy: DispatchStrategy,
  ): Promise<ProviderResponse[]> {
    const results: ProviderResponse[] = [];
    const batches: MeshProvider[][] = [];

    for (let i = 0; i < providers.length; i += strategy.maxConcurrent) {
      batches.push(providers.slice(i, i + strategy.maxConcurrent));
    }

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(p =>
          this.dispatchSingle(p, request.prompt, request.phase, request.role, strategy.timeoutMs),
        ),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /** Dispatch sequentially, stop on first success or exhaust all */
  private async dispatchSequential(
    providers: MeshProvider[],
    request: MeshRequest,
    strategy: DispatchStrategy,
  ): Promise<ProviderResponse[]> {
    const results: ProviderResponse[] = [];

    for (const provider of providers) {
      const result = await this.dispatchSingle(
        provider, request.prompt, request.phase, request.role, strategy.timeoutMs,
      );
      results.push(result);
      if (result.success) break;
    }

    return results;
  }

  /** Build consensus from multiple provider responses */
  buildConsensus(responses: ProviderResponse[], config?: Partial<ConsensusConfig>): ConsensusResult {
    const cfg = { ...this.defaultConsensus, ...config };
    const successful = responses.filter(r => r.success);
    const totalCost = responses.reduce((sum, r) => sum + r.cost, 0);
    const totalLatency = Math.max(...responses.map(r => r.latencyMs), 0);

    if (successful.length < cfg.minProviders) {
      return {
        responses,
        consensusReached: false,
        confidenceScore: 0,
        agreementZones: [],
        conflictZones: ["Insufficient provider responses"],
        totalCost,
        totalLatencyMs: totalLatency,
        providerCount: responses.length,
      };
    }

    // Calculate agreement score by comparing response similarities
    const { agreementScore, agreements, conflicts } = this.analyzeAgreement(successful);

    // Weight by tier
    const tierWeights = { powerful: 3, balanced: 2, fast: 1 };
    let weightedScore = 0;
    let totalWeight = 0;
    for (const r of successful) {
      const weight = tierWeights[r.tier as keyof typeof tierWeights] || 1;
      weightedScore += agreementScore * weight;
      totalWeight += weight;
    }

    const confidenceScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const consensusReached = confidenceScore >= cfg.threshold;

    // Synthesize best response
    let synthesizedResponse: string | undefined;
    if (consensusReached && cfg.conflictResolution === "highest-tier") {
      const byTier = [...successful].sort(
        (a, b) => (tierWeights[b.tier as keyof typeof tierWeights] || 0) - (tierWeights[a.tier as keyof typeof tierWeights] || 0),
      );
      synthesizedResponse = byTier[0]?.response;
    }

    return {
      responses,
      consensusReached,
      confidenceScore,
      agreementZones: agreements,
      conflictZones: conflicts,
      synthesizedResponse,
      totalCost,
      totalLatencyMs: totalLatency,
      providerCount: responses.length,
    };
  }

  /** Analyze agreement between provider responses */
  private analyzeAgreement(responses: ProviderResponse[]): {
    agreementScore: number;
    agreements: string[];
    conflicts: string[];
  } {
    if (responses.length < 2) {
      return { agreementScore: 1.0, agreements: ["Single provider"], conflicts: [] };
    }

    const agreements: string[] = [];
    const conflicts: string[] = [];

    // Extract key themes from each response (simplified: by sentence overlap)
    const responseSentences = responses.map(r =>
      r.response.split(/[.!?\n]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20),
    );

    // Find common themes (sentences that appear in multiple responses)
    const allSentences = responseSentences.flat();
    const sentenceCounts = new Map<string, number>();
    for (const sentences of responseSentences) {
      const seen = new Set<string>();
      for (const s of sentences) {
        const key = s.slice(0, 50); // Compare first 50 chars
        if (!seen.has(key)) {
          sentenceCounts.set(key, (sentenceCounts.get(key) || 0) + 1);
          seen.add(key);
        }
      }
    }

    let agreeCount = 0;
    let totalThemes = 0;
    for (const [theme, count] of sentenceCounts) {
      totalThemes++;
      if (count >= Math.ceil(responses.length * 0.5)) {
        agreeCount++;
        if (agreements.length < 5) agreements.push(theme);
      } else if (count === 1) {
        if (conflicts.length < 5) conflicts.push(theme);
      }
    }

    const agreementScore = totalThemes > 0 ? agreeCount / totalThemes : 0.5;

    return { agreementScore: Math.min(1.0, agreementScore + 0.3), agreements, conflicts };
  }

  // ═══════════════════════════════════════════════════════════
  // COST TRACKING
  // ═══════════════════════════════════════════════════════════

  private calculateCost(provider: MeshProvider, inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1_000_000) * provider.costPerMToken.input +
      (outputTokens / 1_000_000) * provider.costPerMToken.output
    );
  }

  private recordCost(
    providerId: string, phase: string, role: ProviderRole,
    inputTokens: number, outputTokens: number, cost: number, latencyMs: number,
  ): void {
    this.costHistory.push({
      providerId, phase, role, inputTokens, outputTokens, cost, latencyMs,
      timestamp: new Date(),
    });
  }

  /** Generate cost report from accumulated history */
  getCostReport(): CostReport {
    const byProvider: Record<string, { cost: number; calls: number; tokens: number }> = {};
    const byPhase: Record<string, { cost: number; calls: number }> = {};
    const byRole: Record<string, { cost: number; calls: number }> = {};
    let totalCost = 0;
    let totalTokens = 0;
    let totalLatency = 0;

    for (const record of this.costHistory) {
      totalCost += record.cost;
      totalTokens += record.inputTokens + record.outputTokens;
      totalLatency += record.latencyMs;

      if (!byProvider[record.providerId]) byProvider[record.providerId] = { cost: 0, calls: 0, tokens: 0 };
      byProvider[record.providerId].cost += record.cost;
      byProvider[record.providerId].calls += 1;
      byProvider[record.providerId].tokens += record.inputTokens + record.outputTokens;

      if (!byPhase[record.phase]) byPhase[record.phase] = { cost: 0, calls: 0 };
      byPhase[record.phase].cost += record.cost;
      byPhase[record.phase].calls += 1;

      if (!byRole[record.role]) byRole[record.role] = { cost: 0, calls: 0 };
      byRole[record.role].cost += record.cost;
      byRole[record.role].calls += 1;
    }

    const callCount = this.costHistory.length;

    return {
      totalCost,
      totalTokens,
      byProvider,
      byPhase,
      byRole,
      avgCostPerCall: callCount > 0 ? totalCost / callCount : 0,
      avgLatencyMs: callCount > 0 ? totalLatency / callCount : 0,
      callCount,
    };
  }

  /** Reset cost tracking */
  resetCostHistory(): void {
    this.costHistory = [];
  }

  /** Get registered provider count */
  get providerCount(): number {
    return this.providers.size;
  }

  /** Get all registered provider IDs */
  getProviderIds(): string[] {
    return [...this.providers.keys()];
  }
}
