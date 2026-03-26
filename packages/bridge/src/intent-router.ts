/**
 * IntentRouter — NLP-based intent detection and workflow routing
 *
 * Inspired by claude-octopus auto-route.sh.
 * Detects user intent from natural language, classifies complexity,
 * and routes to optimal workflow with cost-aware tier selection.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type WorkflowFamily =
  | "diamond-discover" | "diamond-define" | "diamond-develop" | "diamond-deliver"
  | "crossfire-debate" | "crossfire-adversarial"
  | "knowledge-research" | "knowledge-synthesize"
  | "optimize-performance" | "optimize-security" | "optimize-cost"
  | "factory-autonomous"
  | "quick-check";

export type ComplexityTier = "trivial" | "standard" | "premium";

export type CynefinDomain = "simple" | "complicated" | "complex" | "chaotic";

export type ResponseMode = "direct" | "lightweight" | "standard" | "full";

export interface RoutingRule {
  id: string;
  name: string;
  keywords: string[];
  antiKeywords?: string[];
  workflow: WorkflowFamily;
  priority: number;               // lower = higher priority
  minComplexity?: ComplexityTier;
  requiredContext?: string[];      // e.g. ["has-codebase", "has-tests"]
}

export interface RoutingResult {
  workflow: WorkflowFamily;
  confidence: number;           // 0.0-1.0
  complexity: ComplexityTier;
  responseMode: ResponseMode;
  cynefin: CynefinDomain;
  matchedRule?: string;
  suggestedTier: string;        // "mini" | "standard" | "premium"
  estimatedCostMultiplier: number;
  reasoning: string;
}

export interface IntentContext {
  hasCodebase: boolean;
  hasTests: boolean;
  hasPR: boolean;
  hasSecurityConcern: boolean;
  projectLanguages?: string[];
  recentActivity?: string;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT ROUTING RULES (from Octopus patterns)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RULES: RoutingRule[] = [
  // Security (highest priority)
  { id: "security-audit", name: "Security Audit", priority: 1,
    keywords: ["security", "vulnerability", "cve", "owasp", "pentest", "xss", "csrf", "sql injection", "auth bypass", "exploit"],
    workflow: "optimize-security" },

  // Architecture
  { id: "arch-review", name: "Architecture Review", priority: 2,
    keywords: ["architecture", "system design", "scalability", "microservices", "monolith", "domain model", "bounded context", "event sourcing"],
    workflow: "diamond-discover" },

  // Factory (autonomous)
  { id: "factory", name: "Dark Factory", priority: 3,
    keywords: ["build from spec", "implement spec", "autonomous", "dark factory", "spec to code", "full implementation"],
    minComplexity: "standard",
    workflow: "factory-autonomous" },

  // Debate / Adversarial
  { id: "debate", name: "Adversarial Debate", priority: 4,
    keywords: ["debate", "compare", "tradeoff", "pros and cons", "versus", "vs", "which is better", "should we use"],
    workflow: "crossfire-debate" },

  { id: "adversarial", name: "Adversarial Review", priority: 5,
    keywords: ["devil's advocate", "challenge", "break this", "find flaws", "stress test", "adversarial"],
    workflow: "crossfire-adversarial" },

  // Performance
  { id: "performance", name: "Performance Optimization", priority: 6,
    keywords: ["performance", "slow", "latency", "throughput", "bottleneck", "optimize", "profiling", "memory leak", "cpu"],
    workflow: "optimize-performance" },

  // Cost
  { id: "cost-optimize", name: "Cost Optimization", priority: 7,
    keywords: ["cost", "expensive", "budget", "reduce spend", "cloud costs", "infrastructure cost", "billing"],
    workflow: "optimize-cost" },

  // Research / Discovery
  { id: "research", name: "Research & Discovery", priority: 8,
    keywords: ["research", "explore", "investigate", "what is", "how does", "explain", "understand", "learn about", "survey"],
    workflow: "diamond-discover" },

  // Define / Planning
  { id: "planning", name: "Planning & Definition", priority: 9,
    keywords: ["plan", "define", "requirements", "spec", "scope", "roadmap", "strategy", "design doc", "prd", "rfc"],
    workflow: "diamond-define" },

  // Development
  { id: "develop", name: "Development", priority: 10,
    keywords: ["implement", "build", "create", "code", "develop", "write", "refactor", "migrate", "fix bug"],
    antiKeywords: ["spec", "plan", "research"],
    workflow: "diamond-develop" },

  // Review / Deliver
  { id: "review", name: "Code Review", priority: 11,
    keywords: ["review", "pr review", "code review", "pull request", "check", "validate", "audit"],
    workflow: "diamond-deliver" },

  // Knowledge Synthesis
  { id: "synthesize", name: "Knowledge Synthesis", priority: 12,
    keywords: ["summarize", "synthesize", "consolidate", "combine", "merge findings", "overview", "report"],
    workflow: "knowledge-synthesize" },

  // Quick check (lowest priority, catchall-like)
  { id: "quick", name: "Quick Check", priority: 99,
    keywords: ["quick", "fast", "simple", "trivial", "one-liner"],
    workflow: "quick-check" },
];

// ═══════════════════════════════════════════════════════════════
// COMPLEXITY KEYWORDS
// ═══════════════════════════════════════════════════════════════

const PREMIUM_KEYWORDS = [
  "distributed", "consensus", "cqrs", "event sourcing", "saga", "choreography",
  "multi-tenant", "zero-downtime", "migration", "real-time", "websocket",
  "kubernetes", "terraform", "ci/cd pipeline", "encryption", "compliance",
  "gdpr", "hipaa", "pci-dss", "soc2", "iso27001",
];

const TRIVIAL_KEYWORDS = [
  "rename", "typo", "comment", "format", "lint", "todo", "simple fix",
];

// ═══════════════════════════════════════════════════════════════
// INTENT ROUTER
// ═══════════════════════════════════════════════════════════════

export class IntentRouter {
  private rules: RoutingRule[];
  private customRules: RoutingRule[] = [];

  constructor(rules?: RoutingRule[]) {
    this.rules = rules ?? [...DEFAULT_RULES];
  }

  /** Add custom routing rule */
  addRule(rule: RoutingRule): void {
    this.customRules.push(rule);
    this.rebuildRules();
  }

  /** Remove a rule by ID */
  removeRule(id: string): void {
    this.customRules = this.customRules.filter(r => r.id !== id);
    this.rules = this.rules.filter(r => r.id !== id);
  }

  /** Route a natural language prompt to optimal workflow */
  route(prompt: string, context?: IntentContext): RoutingResult {
    const lower = prompt.toLowerCase();
    const words = lower.split(/\s+/);
    const wordCount = words.length;

    // 1. Classify complexity
    const complexity = this.classifyComplexity(lower, wordCount);

    // 2. Detect Cynefin domain
    const cynefin = this.classifyCynefin(lower, complexity);

    // 3. Determine response mode (cost-aware)
    const responseMode = this.detectResponseMode(lower, complexity);

    // 4. Match routing rules
    const match = this.matchRule(lower, complexity, context);

    // 5. Build result
    const costMultipliers: Record<ResponseMode, number> = {
      direct: 0.1,
      lightweight: 0.5,
      standard: 1.0,
      full: 3.0,
    };

    const tierNames: Record<ComplexityTier, string> = {
      trivial: "mini",
      standard: "standard",
      premium: "premium",
    };

    return {
      workflow: match.workflow,
      confidence: match.confidence,
      complexity,
      responseMode,
      cynefin,
      matchedRule: match.ruleId,
      suggestedTier: tierNames[complexity],
      estimatedCostMultiplier: costMultipliers[responseMode],
      reasoning: match.reasoning,
    };
  }

  /** Classify prompt complexity */
  classifyComplexity(prompt: string, wordCount: number): ComplexityTier {
    // Check for premium indicators
    let premiumScore = 0;
    for (const kw of PREMIUM_KEYWORDS) {
      if (prompt.includes(kw)) premiumScore++;
    }
    if (premiumScore >= 2 || wordCount > 80) return "premium";

    // Check for trivial indicators
    let trivialScore = 0;
    for (const kw of TRIVIAL_KEYWORDS) {
      if (prompt.includes(kw)) trivialScore++;
    }
    if (trivialScore >= 1 && wordCount < 15) return "trivial";

    if (wordCount < 10) return "trivial";
    return "standard";
  }

  /** Classify into Cynefin framework domain */
  classifyCynefin(prompt: string, complexity: ComplexityTier): CynefinDomain {
    if (complexity === "trivial") return "simple";

    const chaosIndicators = ["incident", "outage", "emergency", "production down", "critical bug", "hotfix"];
    if (chaosIndicators.some(k => prompt.includes(k))) return "chaotic";

    const complexIndicators = ["distributed", "consensus", "multi-service", "eventual consistency", "saga"];
    if (complexIndicators.some(k => prompt.includes(k))) return "complex";

    if (complexity === "premium") return "complicated";
    return "simple";
  }

  /** Detect optimal response mode (cost-awareness) */
  detectResponseMode(prompt: string, complexity: ComplexityTier): ResponseMode {
    // Check for explicit mode indicators first (highest priority)
    const fullIndicators = ["thorough", "comprehensive", "exhaustive", "deep dive", "full analysis"];
    if (fullIndicators.some(k => prompt.includes(k))) return "full";

    const lightIndicators = ["quick", "brief", "overview", "glance", "check"];
    if (lightIndicators.some(k => prompt.includes(k))) return "lightweight";

    // Fall back to complexity-based modes
    if (complexity === "trivial") return "direct";
    if (complexity === "premium") return "full";
    return "standard";
  }

  /** Match best routing rule */
  private matchRule(
    prompt: string,
    complexity: ComplexityTier,
    context?: IntentContext,
  ): { workflow: WorkflowFamily; confidence: number; ruleId?: string; reasoning: string } {
    const candidates: Array<{
      rule: RoutingRule;
      score: number;
      matchedKeywords: string[];
    }> = [];

    for (const rule of this.rules) {
      // Check min complexity
      if (rule.minComplexity) {
        const tiers: ComplexityTier[] = ["trivial", "standard", "premium"];
        if (tiers.indexOf(complexity) < tiers.indexOf(rule.minComplexity)) continue;
      }

      // Check anti-keywords
      if (rule.antiKeywords?.some(ak => prompt.includes(ak))) continue;

      // Check required context
      if (rule.requiredContext) {
        if (!context) {
          // If rule requires context but none provided, skip
          continue;
        }
        const contextMap: Record<string, boolean> = {
          "has-codebase": context.hasCodebase,
          "has-tests": context.hasTests,
          "has-pr": context.hasPR,
          "has-security": context.hasSecurityConcern,
        };
        if (rule.requiredContext.some(rc => !contextMap[rc])) continue;
      }

      // Score keyword matches
      const matched = rule.keywords.filter(kw => prompt.includes(kw));
      if (matched.length > 0) {
        // Score = matched keywords count, weighted by priority (lower priority = higher weight)
        const priorityWeight = 1 / (rule.priority * 0.1 + 1);
        const score = matched.length * priorityWeight;
        candidates.push({ rule, score, matchedKeywords: matched });
      }
    }

    if (candidates.length === 0) {
      // Default to discover for research-like, develop for action-like
      const actionWords = ["build", "create", "implement", "fix", "update", "change", "add", "make"];
      const isAction = actionWords.some(w => prompt.includes(w));
      return {
        workflow: isAction ? "diamond-develop" : "diamond-discover",
        confidence: 0.3,
        reasoning: "No rule matched; defaulted based on action/research heuristic",
      };
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // Confidence based on match quality
    const confidence = Math.min(1.0, 0.4 + best.matchedKeywords.length * 0.15);

    return {
      workflow: best.rule.workflow,
      confidence,
      ruleId: best.rule.id,
      reasoning: `Matched "${best.rule.name}" (${best.matchedKeywords.join(", ")})`,
    };
  }

  /** Rebuild sorted rule list */
  private rebuildRules(): void {
    this.rules = [...DEFAULT_RULES, ...this.customRules].sort((a, b) => a.priority - b.priority);
  }

  /** Get all registered rules */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /** Get workflows for a specific Cynefin domain */
  getWorkflowsForDomain(domain: CynefinDomain): WorkflowFamily[] {
    const mapping: Record<CynefinDomain, WorkflowFamily[]> = {
      simple: ["quick-check", "diamond-develop"],
      complicated: ["diamond-discover", "diamond-define", "diamond-develop", "diamond-deliver"],
      complex: ["crossfire-debate", "knowledge-research", "diamond-discover"],
      chaotic: ["factory-autonomous", "optimize-security", "quick-check"],
    };
    return mapping[domain] ?? ["diamond-discover"];
  }
}

/** Factory: create IntentRouter with default + custom rules */
export function createIntentRouter(customRules?: RoutingRule[]): IntentRouter {
  const router = new IntentRouter();
  if (customRules) {
    for (const rule of customRules) {
      router.addRule(rule);
    }
  }
  return router;
}
