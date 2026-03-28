/**
 * Pipeline Hook System — Event-driven middleware for Nexus pipelines
 *
 * Inspired by everything-claude-code's PreToolUse/PostToolUse/Stop hook pattern.
 * Hooks intercept pipeline steps and can inspect, modify, or block execution.
 *
 * Hook lifecycle:
 *   PreStep  → [step executes] → PostStep → PreStep → [next step] → PostStep → OnComplete
 *   OnError fires if any step throws.
 *
 * Example:
 *   hooks.register("pre-step", async (ctx) => {
 *     if (ctx.stepName === "security-review" && ctx.snapshot.score.overall < 30) {
 *       ctx.metadata.set("fast-fail", true);
 *       return { action: "skip", reason: "Score too low for deep security scan" };
 *     }
 *     return { action: "continue" };
 *   });
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type {
  ArchitectureSnapshot,
  GuidanceFinding,
  GuidanceResult,
} from "@camilooscargbaptista/nexus-types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type HookPhase = "pre-step" | "post-step" | "on-complete" | "on-error";

export type HookAction = "continue" | "skip" | "abort" | "retry";

export interface HookDecision {
  action: HookAction;
  reason?: string;
  /** Optional: modified snapshot to pass to the step (pre-step only) */
  modifiedSnapshot?: ArchitectureSnapshot;
  /** Optional: modified findings to pass downstream (post-step only) */
  modifiedFindings?: GuidanceFinding[];
}

export interface HookContext {
  /** Current pipeline name */
  pipeline: string;
  /** Current step index (0-based) */
  stepIndex: number;
  /** Current step's skill name */
  stepName: string;
  /** Architecture snapshot being analyzed */
  snapshot: ArchitectureSnapshot;
  /** Accumulated findings from previous steps */
  accumulatedFindings: GuidanceFinding[];
  /** Step result (only available in post-step and on-complete) */
  stepResult?: GuidanceResult;
  /** Error (only available in on-error) */
  error?: Error;
  /** Total steps in pipeline */
  totalSteps: number;
  /** Pipeline start time */
  startedAt: number;
  /** Shared metadata bag — hooks can communicate via this */
  metadata: Map<string, unknown>;
}

export type HookHandler = (ctx: HookContext) => Promise<HookDecision> | HookDecision;

export interface HookRegistration {
  id: string;
  phase: HookPhase;
  handler: HookHandler;
  /** Higher priority hooks run first (default: 0) */
  priority: number;
  /** Optional: only trigger for specific skill names */
  skillFilter?: string[];
  /** Hook name for debugging */
  name?: string;
  /** Enabled flag (default: true) */
  enabled: boolean;
}

export interface HookExecutionRecord {
  hookId: string;
  hookName?: string;
  phase: HookPhase;
  stepName: string;
  decision: HookDecision;
  duration: number;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE HOOK MANAGER
// ═══════════════════════════════════════════════════════════════

let hookIdCounter = 0;

export class PipelineHookManager {
  private hooks: Map<string, HookRegistration> = new Map();
  private executionLog: HookExecutionRecord[] = [];
  private maxLogSize: number;

  constructor(options: { maxLogSize?: number } = {}) {
    this.maxLogSize = options.maxLogSize ?? 1000;
  }

  /**
   * Register a hook for a specific phase.
   * Returns the hook ID for later removal.
   */
  register(
    phase: HookPhase,
    handler: HookHandler,
    options: {
      priority?: number;
      skillFilter?: string[];
      name?: string;
      enabled?: boolean;
    } = {},
  ): string {
    const id = `hook-${++hookIdCounter}`;
    this.hooks.set(id, {
      id,
      phase,
      handler,
      priority: options.priority ?? 0,
      skillFilter: options.skillFilter,
      name: options.name,
      enabled: options.enabled ?? true,
    });
    return id;
  }

  /**
   * Remove a hook by ID.
   */
  unregister(hookId: string): boolean {
    return this.hooks.delete(hookId);
  }

  /**
   * Enable or disable a hook.
   */
  setEnabled(hookId: string, enabled: boolean): void {
    const hook = this.hooks.get(hookId);
    if (hook) hook.enabled = enabled;
  }

  /**
   * Execute all hooks for a given phase.
   * Hooks run in priority order (highest first).
   * First "skip" or "abort" decision wins — remaining hooks are skipped.
   */
  async execute(phase: HookPhase, ctx: HookContext): Promise<HookDecision> {
    const matching = this.getMatchingHooks(phase, ctx.stepName);

    let finalDecision: HookDecision = { action: "continue" };

    for (const hook of matching) {
      const start = Date.now();
      let decision: HookDecision;

      try {
        decision = await hook.handler(ctx);
      } catch (err) {
        decision = {
          action: "continue",
          reason: `Hook "${hook.name ?? hook.id}" threw: ${(err as Error).message}`,
        };
      }

      this.recordExecution({
        hookId: hook.id,
        hookName: hook.name,
        phase,
        stepName: ctx.stepName,
        decision,
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
      });

      // "abort" always wins
      if (decision.action === "abort") {
        return decision;
      }

      // "skip" wins over "continue" and "retry"
      if (decision.action === "skip" && finalDecision.action === "continue") {
        finalDecision = decision;
      }

      // "retry" wins over "continue"
      if (decision.action === "retry" && finalDecision.action === "continue") {
        finalDecision = decision;
      }

      // Apply modifications from post-step hooks
      if (phase === "post-step" && decision.modifiedFindings) {
        ctx.accumulatedFindings = decision.modifiedFindings;
      }

      // Apply modified snapshot from pre-step hooks
      if (phase === "pre-step" && decision.modifiedSnapshot) {
        ctx.snapshot = decision.modifiedSnapshot;
      }
    }

    return finalDecision;
  }

  /**
   * Get execution log, optionally filtered.
   */
  getExecutionLog(options: {
    phase?: HookPhase;
    stepName?: string;
    limit?: number;
  } = {}): HookExecutionRecord[] {
    let records = [...this.executionLog];

    if (options.phase) records = records.filter(r => r.phase === options.phase);
    if (options.stepName) records = records.filter(r => r.stepName === options.stepName);
    if (options.limit) records = records.slice(-options.limit);

    return records;
  }

  /**
   * Get all registered hooks for a phase.
   */
  getHooks(phase?: HookPhase): HookRegistration[] {
    const all = Array.from(this.hooks.values());
    if (phase) return all.filter(h => h.phase === phase);
    return all;
  }

  /**
   * Clear execution log.
   */
  clearLog(): void {
    this.executionLog = [];
  }

  /**
   * Reset all hooks and log.
   */
  reset(): void {
    this.hooks.clear();
    this.executionLog = [];
  }

  /** Total registered hooks */
  get hookCount(): number {
    return this.hooks.size;
  }

  // ─── Private ────────────────────────────────────────────────

  private getMatchingHooks(phase: HookPhase, stepName: string): HookRegistration[] {
    return Array.from(this.hooks.values())
      .filter(h =>
        h.enabled &&
        h.phase === phase &&
        (!h.skillFilter || h.skillFilter.length === 0 || h.skillFilter.includes(stepName)),
      )
      .sort((a, b) => b.priority - a.priority);
  }

  private recordExecution(record: HookExecutionRecord): void {
    this.executionLog.push(record);
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(-this.maxLogSize);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Timing hook — records step execution time in metadata.
 */
export function createTimingHook(): {
  preStep: HookHandler;
  postStep: HookHandler;
} {
  return {
    preStep: (ctx) => {
      ctx.metadata.set(`step-${ctx.stepIndex}-start`, Date.now());
      return { action: "continue" };
    },
    postStep: (ctx) => {
      const start = ctx.metadata.get(`step-${ctx.stepIndex}-start`) as number | undefined;
      if (start) {
        ctx.metadata.set(`step-${ctx.stepIndex}-duration`, Date.now() - start);
      }
      return { action: "continue" };
    },
  };
}

/**
 * Finding threshold hook — aborts pipeline if critical findings exceed limit.
 */
export function createFindingThresholdHook(maxCritical: number): HookHandler {
  return (ctx) => {
    const criticalCount = ctx.accumulatedFindings.filter(
      f => f.severity === "critical" || (f.severity as string) === "critical",
    ).length;

    if (criticalCount > maxCritical) {
      return {
        action: "abort",
        reason: `Critical findings (${criticalCount}) exceeded threshold (${maxCritical})`,
      };
    }
    return { action: "continue" };
  };
}

/**
 * Score gate hook — skips expensive steps if score is above threshold.
 */
export function createScoreGateHook(minScore: number): HookHandler {
  return (ctx) => {
    if (ctx.snapshot.score.overall >= minScore) {
      return {
        action: "skip",
        reason: `Score ${ctx.snapshot.score.overall} >= ${minScore}, skipping deep analysis`,
      };
    }
    return { action: "continue" };
  };
}
