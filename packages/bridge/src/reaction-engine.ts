/**
 * ReactionEngine — Event-driven auto-response to CI/PR/system events
 *
 * Inspired by claude-octopus sentinel.sh + reaction engine.
 * Monitors events, matches reaction rules, and executes automated responses.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type EventSource = "ci" | "pr" | "deploy" | "monitor" | "schedule" | "manual";

export type EventSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ReactionAction =
  | "auto-fix" | "notify" | "escalate" | "rollback"
  | "retry" | "block" | "analyze" | "create-issue" | "skip";

export interface SystemEvent {
  id: string;
  source: EventSource;
  type: string;                  // e.g. "ci.failed", "pr.review-requested", "deploy.failed"
  severity: EventSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;        // links related events
}

export interface ReactionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;

  // Matching criteria
  eventTypes: string[];          // glob patterns: "ci.*", "pr.review-requested"
  severityMin?: EventSeverity;   // minimum severity to trigger
  conditions?: ReactionCondition[];

  // Response
  actions: ReactionAction[];
  priority: number;              // lower = higher priority
  cooldownMs: number;            // min time between triggers
  maxRetries: number;

  // Escalation
  escalateAfter?: number;        // escalate after N failures
  escalateTo?: ReactionAction;
}

export interface ReactionCondition {
  field: string;                 // JSONPath-like: "metadata.exitCode", "title"
  operator: "equals" | "contains" | "gt" | "lt" | "matches" | "exists";
  value: unknown;
}

export interface ReactionExecution {
  ruleId: string;
  ruleName: string;
  event: SystemEvent;
  actions: ReactionAction[];
  status: "pending" | "executing" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
  retryCount: number;
}

export interface ReactionStats {
  totalEvents: number;
  totalReactions: number;
  bySource: Record<string, number>;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  avgReactionTimeMs: number;
  successRate: number;
}

/** External dependency: executes the actual action */
export interface ActionExecutor {
  execute(action: ReactionAction, event: SystemEvent, context: Record<string, unknown>): Promise<string>;
}

// ═══════════════════════════════════════════════════════════════
// SEVERITY ORDERING
// ═══════════════════════════════════════════════════════════════

const SEVERITY_ORDER: Record<EventSeverity, number> = {
  critical: 5, high: 4, medium: 3, low: 2, info: 1,
};

// ═══════════════════════════════════════════════════════════════
// DEFAULT REACTION RULES
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_REACTION_RULES: ReactionRule[] = [
  {
    id: "ci-critical-failure",
    name: "CI Critical Failure",
    description: "Auto-analyze and attempt fix on critical CI failures",
    enabled: true,
    eventTypes: ["ci.failed"],
    severityMin: "critical",
    actions: ["analyze", "auto-fix", "notify"],
    priority: 1,
    cooldownMs: 300_000,  // 5 min
    maxRetries: 2,
    escalateAfter: 2,
    escalateTo: "escalate",
  },
  {
    id: "security-vulnerability",
    name: "Security Vulnerability Detected",
    description: "Block deploy and notify on security findings",
    enabled: true,
    eventTypes: ["ci.security-scan", "monitor.vulnerability"],
    severityMin: "high",
    actions: ["block", "notify", "create-issue"],
    priority: 1,
    cooldownMs: 0,
    maxRetries: 0,
  },
  {
    id: "deploy-failure",
    name: "Deploy Failure",
    description: "Auto-rollback on deploy failure",
    enabled: true,
    eventTypes: ["deploy.failed"],
    severityMin: "high",
    actions: ["rollback", "notify", "analyze"],
    priority: 2,
    cooldownMs: 60_000,
    maxRetries: 1,
    escalateAfter: 1,
    escalateTo: "escalate",
  },
  {
    id: "pr-review-requested",
    name: "PR Review Auto-Analyze",
    description: "Run architecture + security analysis on new PRs",
    enabled: true,
    eventTypes: ["pr.review-requested", "pr.opened"],
    actions: ["analyze"],
    priority: 5,
    cooldownMs: 0,
    maxRetries: 1,
  },
  {
    id: "ci-test-failure",
    name: "CI Test Failure",
    description: "Analyze test failures and suggest fixes",
    enabled: true,
    eventTypes: ["ci.test-failed"],
    severityMin: "medium",
    actions: ["analyze", "notify"],
    priority: 3,
    cooldownMs: 120_000,
    maxRetries: 1,
  },
  {
    id: "quality-gate-failed",
    name: "Quality Gate Failed",
    description: "Block merge when quality gate fails",
    enabled: true,
    eventTypes: ["ci.quality-gate-failed"],
    actions: ["block", "notify"],
    priority: 2,
    cooldownMs: 0,
    maxRetries: 0,
  },
];

// ═══════════════════════════════════════════════════════════════
// REACTION ENGINE
// ═══════════════════════════════════════════════════════════════

export class ReactionEngine {
  private rules: Map<string, ReactionRule> = new Map();
  private history: ReactionExecution[] = [];
  private lastTriggered: Map<string, number> = new Map();  // ruleId → timestamp
  private failureCounts: Map<string, number> = new Map();  // ruleId → failure count

  constructor(
    private readonly executor: ActionExecutor,
    rules?: ReactionRule[],
  ) {
    const initial = rules ?? DEFAULT_REACTION_RULES;
    for (const rule of initial) {
      this.rules.set(rule.id, rule);
    }
  }

  /** Register a new reaction rule */
  addRule(rule: ReactionRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Remove a reaction rule */
  removeRule(id: string): void {
    this.rules.delete(id);
  }

  /** Enable/disable a rule */
  setRuleEnabled(id: string, enabled: boolean): void {
    const rule = this.rules.get(id);
    if (rule) rule.enabled = enabled;
  }

  /** Process an incoming event — find matching rules and execute reactions */
  async processEvent(event: SystemEvent): Promise<ReactionExecution[]> {
    const matchingRules = this.findMatchingRules(event);
    const executions: ReactionExecution[] = [];

    for (const rule of matchingRules) {
      // Check cooldown
      const lastTime = this.lastTriggered.get(rule.id) || 0;
      if (Date.now() - lastTime < rule.cooldownMs) continue;

      const execution = await this.executeReaction(rule, event);
      executions.push(execution);
      this.history.push(execution);
      this.lastTriggered.set(rule.id, Date.now());

      // Track failures for escalation
      if (execution.status === "failed") {
        const count = (this.failureCounts.get(rule.id) || 0) + 1;
        this.failureCounts.set(rule.id, count);

        // Escalate if threshold reached
        if (rule.escalateAfter && count >= rule.escalateAfter && rule.escalateTo) {
          const escalation = await this.executeAction(rule.escalateTo, event);
          execution.result = `${execution.result || ""}\nEscalated: ${escalation}`;
        }
      } else {
        this.failureCounts.set(rule.id, 0); // reset on success
      }
    }

    return executions;
  }

  /** Find rules matching an event */
  private findMatchingRules(event: SystemEvent): ReactionRule[] {
    const matched: ReactionRule[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check event type match (supports glob patterns)
      const typeMatches = rule.eventTypes.some(pattern => {
        if (pattern.endsWith("*")) {
          return event.type.startsWith(pattern.slice(0, -1));
        }
        return event.type === pattern;
      });
      if (!typeMatches) continue;

      // Check severity minimum
      if (rule.severityMin) {
        if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[rule.severityMin]) continue;
      }

      // Check conditions
      if (rule.conditions?.length) {
        const allMet = rule.conditions.every(c => this.evaluateCondition(c, event));
        if (!allMet) continue;
      }

      matched.push(rule);
    }

    // Sort by priority
    return matched.sort((a, b) => a.priority - b.priority);
  }

  /** Evaluate a single condition against an event */
  private evaluateCondition(condition: ReactionCondition, event: SystemEvent): boolean {
    const value = this.getNestedValue(event, condition.field);

    switch (condition.operator) {
      case "equals": return value === condition.value;
      case "contains": return typeof value === "string" && value.includes(String(condition.value));
      case "gt": return typeof value === "number" && value > (condition.value as number);
      case "lt": return typeof value === "number" && value < (condition.value as number);
      case "matches": return typeof value === "string" && new RegExp(String(condition.value)).test(value);
      case "exists": return value !== undefined && value !== null;
      default: return false;
    }
  }

  /** Get nested value from object using dot notation */
  private getNestedValue(obj: any, path: string): unknown {
    return path.split(".").reduce((curr, key) => curr?.[key], obj);
  }

  /** Execute a reaction rule's actions */
  private async executeReaction(rule: ReactionRule, event: SystemEvent): Promise<ReactionExecution> {
    const execution: ReactionExecution = {
      ruleId: rule.id,
      ruleName: rule.name,
      event,
      actions: rule.actions,
      status: "executing",
      startedAt: new Date(),
      retryCount: 0,
    };

    const results: string[] = [];
    let failed = false;

    for (const action of rule.actions) {
      let retries = 0;
      let success = false;

      while (retries <= rule.maxRetries && !success) {
        try {
          const result = await this.executeAction(action, event);
          results.push(`${action}: ${result}`);
          success = true;
        } catch (err: any) {
          retries++;
          if (retries > rule.maxRetries) {
            results.push(`${action}: FAILED — ${err.message}`);
            failed = true;
          }
        }
      }
      execution.retryCount = Math.max(execution.retryCount, retries);
    }

    execution.status = failed ? "failed" : "completed";
    execution.result = results.join("\n");
    execution.completedAt = new Date();

    return execution;
  }

  /** Execute a single action */
  private async executeAction(action: ReactionAction, event: SystemEvent): Promise<string> {
    return this.executor.execute(action, event, {
      failureCount: this.failureCounts.get(event.type) || 0,
    });
  }

  /** Get reaction statistics */
  getStats(): ReactionStats {
    const bySource: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let totalReactionTime = 0;
    let successCount = 0;

    for (const exec of this.history) {
      const source = exec.event.source;
      bySource[source] = (bySource[source] || 0) + 1;

      for (const action of exec.actions) {
        byAction[action] = (byAction[action] || 0) + 1;
      }

      const sev = exec.event.severity;
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;

      if (exec.completedAt) {
        totalReactionTime += exec.completedAt.getTime() - exec.startedAt.getTime();
      }
      if (exec.status === "completed") successCount++;
    }

    return {
      totalEvents: new Set(this.history.map(h => h.event.id)).size,
      totalReactions: this.history.length,
      bySource,
      byAction,
      bySeverity,
      avgReactionTimeMs: this.history.length > 0 ? totalReactionTime / this.history.length : 0,
      successRate: this.history.length > 0 ? successCount / this.history.length : 1,
    };
  }

  /** Get execution history */
  getHistory(limit: number = 50): ReactionExecution[] {
    return this.history.slice(-limit);
  }

  /** Get all registered rules */
  getRules(): ReactionRule[] {
    return [...this.rules.values()];
  }

  /** Clear history and counters */
  reset(): void {
    this.history = [];
    this.lastTriggered.clear();
    this.failureCounts.clear();
  }
}
