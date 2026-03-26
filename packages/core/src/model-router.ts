/**
 * Model Router — Task-aware LLM selection
 *
 * Inspired by everything-claude-code's model routing pattern:
 *   - Haiku for fast exploration (grep, glob, quick scans)
 *   - Sonnet for coding tasks (refactoring, generation)
 *   - Opus for deep analysis (architecture, security, critical decisions)
 *
 * The router selects the optimal model tier based on task characteristics:
 *   - Task complexity (simple scan vs deep architecture review)
 *   - Finding severity context (critical issues → upgrade to heavier model)
 *   - Cost/latency budget constraints
 *   - Historical accuracy per task type
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions, LLMResponse } from "./llm-provider.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ModelTier = "fast" | "balanced" | "powerful";

export interface TaskProfile {
  /** Task name or skill name */
  name: string;
  /** Task type classification */
  type: TaskType;
  /** Expected complexity */
  complexity: "low" | "medium" | "high";
  /** Context size hint (approximate tokens) */
  contextSize?: number;
  /** Whether the task involves critical findings */
  hasCriticalFindings?: boolean;
  /** Custom tier override (bypasses routing logic) */
  tierOverride?: ModelTier;
}

export type TaskType =
  | "exploration"       // File scanning, pattern matching
  | "code-review"       // Code analysis, style checks
  | "security-analysis" // Vulnerability scanning
  | "architecture"      // Deep architecture review
  | "generation"        // Code/doc generation
  | "remediation"       // Auto-fix generation
  | "decision"          // ADR, trade-off analysis
  | "quick-check";      // Linting, simple validation

export interface RoutingRule {
  /** Match condition */
  match: (task: TaskProfile) => boolean;
  /** Target tier when matched */
  tier: ModelTier;
  /** Priority (higher wins on conflict) */
  priority: number;
  /** Rule name for debugging */
  name: string;
}

export interface RoutingDecision {
  tier: ModelTier;
  provider: LLMProvider;
  reason: string;
  rule?: string;
  estimatedCostMultiplier: number;
}

export interface RoutingStats {
  totalRouted: number;
  byTier: Record<ModelTier, number>;
  byTaskType: Record<string, number>;
  avgLatencyByTier: Record<ModelTier, number>;
  upgrades: number; // times a task was upgraded from initial tier
}

export interface ModelRouterConfig {
  /** Provider for fast/cheap tasks (e.g. Haiku) */
  fast?: LLMProvider;
  /** Provider for balanced tasks (e.g. Sonnet) — default tier */
  balanced: LLMProvider;
  /** Provider for complex/critical tasks (e.g. Opus) */
  powerful?: LLMProvider;
  /** Custom routing rules (added to defaults) */
  customRules?: RoutingRule[];
  /** If true, always use balanced (disables routing) */
  disableRouting?: boolean;
  /** Max context tokens before auto-upgrading tier */
  contextUpgradeThreshold?: number;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT ROUTING RULES
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RULES: RoutingRule[] = [
  // Critical findings always go to powerful
  {
    name: "critical-upgrade",
    match: (t) => t.hasCriticalFindings === true,
    tier: "powerful",
    priority: 100,
  },
  // Architecture and decision tasks → powerful
  {
    name: "architecture-tasks",
    match: (t) => t.type === "architecture" || t.type === "decision",
    tier: "powerful",
    priority: 80,
  },
  // Security analysis → at least balanced, powerful if complex
  {
    name: "security-complex",
    match: (t) => t.type === "security-analysis" && t.complexity === "high",
    tier: "powerful",
    priority: 70,
  },
  {
    name: "security-standard",
    match: (t) => t.type === "security-analysis",
    tier: "balanced",
    priority: 60,
  },
  // Remediation → balanced (needs good code generation)
  {
    name: "remediation",
    match: (t) => t.type === "remediation",
    tier: "balanced",
    priority: 50,
  },
  // Code review → balanced
  {
    name: "code-review",
    match: (t) => t.type === "code-review",
    tier: "balanced",
    priority: 40,
  },
  // Generation → balanced
  {
    name: "generation",
    match: (t) => t.type === "generation",
    tier: "balanced",
    priority: 40,
  },
  // Exploration and quick checks → fast
  {
    name: "exploration",
    match: (t) => t.type === "exploration",
    tier: "fast",
    priority: 30,
  },
  {
    name: "quick-check",
    match: (t) => t.type === "quick-check",
    tier: "fast",
    priority: 30,
  },
  // Low complexity → fast
  {
    name: "low-complexity",
    match: (t) => t.complexity === "low",
    tier: "fast",
    priority: 20,
  },
  // High complexity → powerful
  {
    name: "high-complexity",
    match: (t) => t.complexity === "high",
    tier: "powerful",
    priority: 20,
  },
];

// Cost multipliers relative to balanced tier
const COST_MULTIPLIERS: Record<ModelTier, number> = {
  fast: 0.1,
  balanced: 1.0,
  powerful: 5.0,
};

// ═══════════════════════════════════════════════════════════════
// MODEL ROUTER
// ═══════════════════════════════════════════════════════════════

export class ModelRouter {
  private rules: RoutingRule[];
  private providers: Record<ModelTier, LLMProvider>;
  private contextUpgradeThreshold: number;
  private disableRouting: boolean;

  // Stats tracking
  private stats: RoutingStats = {
    totalRouted: 0,
    byTier: { fast: 0, balanced: 0, powerful: 0 },
    byTaskType: {},
    avgLatencyByTier: { fast: 0, balanced: 0, powerful: 0 },
    upgrades: 0,
  };
  private latencyAccumulator: Record<ModelTier, { total: number; count: number }> = {
    fast: { total: 0, count: 0 },
    balanced: { total: 0, count: 0 },
    powerful: { total: 0, count: 0 },
  };

  constructor(config: ModelRouterConfig) {
    this.providers = {
      fast: config.fast ?? config.balanced,
      balanced: config.balanced,
      powerful: config.powerful ?? config.balanced,
    };

    this.rules = [...DEFAULT_RULES, ...(config.customRules ?? [])].sort(
      (a, b) => b.priority - a.priority,
    );

    this.contextUpgradeThreshold = config.contextUpgradeThreshold ?? 50_000;
    this.disableRouting = config.disableRouting ?? false;
  }

  /**
   * Route a task to the optimal provider and execute the chat.
   */
  async chat(
    task: TaskProfile,
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): Promise<{ response: LLMResponse; routing: RoutingDecision }> {
    const decision = this.route(task);
    const start = Date.now();

    const response = await decision.provider.chat(messages, options);

    const latency = Date.now() - start;
    this.recordLatency(decision.tier, latency);

    return { response, routing: decision };
  }

  /**
   * Determine which provider tier should handle a task.
   * Does not execute — useful for inspection/testing.
   */
  route(task: TaskProfile): RoutingDecision {
    this.stats.totalRouted++;
    this.stats.byTaskType[task.type] = (this.stats.byTaskType[task.type] ?? 0) + 1;

    // Override check
    if (task.tierOverride) {
      const tier = task.tierOverride;
      this.stats.byTier[tier]++;
      return {
        tier,
        provider: this.providers[tier],
        reason: `Manual override to ${tier}`,
        estimatedCostMultiplier: COST_MULTIPLIERS[tier],
      };
    }

    // Routing disabled → always balanced
    if (this.disableRouting) {
      this.stats.byTier.balanced++;
      return {
        tier: "balanced",
        provider: this.providers.balanced,
        reason: "Routing disabled — using balanced tier",
        estimatedCostMultiplier: COST_MULTIPLIERS.balanced,
      };
    }

    // Find first matching rule
    let tier: ModelTier = "balanced";
    let matchedRule: string | undefined;

    for (const rule of this.rules) {
      if (rule.match(task)) {
        tier = rule.tier;
        matchedRule = rule.name;
        break;
      }
    }

    // Context size upgrade
    const initialTier = tier;
    if (task.contextSize && task.contextSize > this.contextUpgradeThreshold) {
      if (tier === "fast") {
        tier = "balanced";
      }
    }

    if (tier !== initialTier) {
      this.stats.upgrades++;
    }

    this.stats.byTier[tier]++;

    return {
      tier,
      provider: this.providers[tier],
      reason: matchedRule
        ? `Matched rule "${matchedRule}" → ${tier}`
        : `Default fallback → ${tier}`,
      rule: matchedRule,
      estimatedCostMultiplier: COST_MULTIPLIERS[tier],
    };
  }

  /**
   * Get routing statistics.
   */
  getStats(): RoutingStats {
    // Compute avg latencies
    for (const tier of ["fast", "balanced", "powerful"] as ModelTier[]) {
      const acc = this.latencyAccumulator[tier];
      this.stats.avgLatencyByTier[tier] = acc.count > 0
        ? Math.round(acc.total / acc.count)
        : 0;
    }
    return { ...this.stats };
  }

  /**
   * Get the provider for a specific tier.
   */
  getProvider(tier: ModelTier): LLMProvider {
    return this.providers[tier];
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalRouted: 0,
      byTier: { fast: 0, balanced: 0, powerful: 0 },
      byTaskType: {},
      avgLatencyByTier: { fast: 0, balanced: 0, powerful: 0 },
      upgrades: 0,
    };
    this.latencyAccumulator = {
      fast: { total: 0, count: 0 },
      balanced: { total: 0, count: 0 },
      powerful: { total: 0, count: 0 },
    };
  }

  // ─── Private ────────────────────────────────────────────────

  private recordLatency(tier: ModelTier, latency: number): void {
    this.latencyAccumulator[tier].total += latency;
    this.latencyAccumulator[tier].count++;
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Infer a TaskProfile from a skill name using common conventions.
 */
export function inferTaskProfile(skillName: string, options: {
  hasCriticalFindings?: boolean;
  contextSize?: number;
} = {}): TaskProfile {
  const name = skillName.toLowerCase();

  // Security-related skills
  if (name.includes("security") || name.includes("pentest") || name.includes("vuln")) {
    return {
      name: skillName,
      type: "security-analysis",
      complexity: name.includes("pentest") ? "high" : "medium",
      ...options,
    };
  }

  // Architecture-related skills
  if (name.includes("architect") || name.includes("design-pattern") || name.includes("domain-model")) {
    return {
      name: skillName,
      type: "architecture",
      complexity: "high",
      ...options,
    };
  }

  // Decision skills
  if (name.includes("adr") || name.includes("trade-off") || name.includes("decision")) {
    return {
      name: skillName,
      type: "decision",
      complexity: "high",
      ...options,
    };
  }

  // Remediation skills
  if (name.includes("fix") || name.includes("remediat") || name.includes("refactor")) {
    return {
      name: skillName,
      type: "remediation",
      complexity: "medium",
      ...options,
    };
  }

  // Review skills
  if (name.includes("review") || name.includes("lint") || name.includes("quality")) {
    return {
      name: skillName,
      type: "code-review",
      complexity: "medium",
      ...options,
    };
  }

  // Performance / database
  if (name.includes("performance") || name.includes("database") || name.includes("observ")) {
    return {
      name: skillName,
      type: "code-review",
      complexity: "medium",
      ...options,
    };
  }

  // Quick checks
  if (name.includes("lint") || name.includes("format") || name.includes("style")) {
    return {
      name: skillName,
      type: "quick-check",
      complexity: "low",
      ...options,
    };
  }

  // Default: code-review with medium complexity
  return {
    name: skillName,
    type: "code-review",
    complexity: "medium",
    ...options,
  };
}
