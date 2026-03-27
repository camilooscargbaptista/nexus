/**
 * @nexus/bridge — Pipeline Orchestrator
 *
 * Orquestrador autônomo que conecta todos os módulos do Nexus
 * num fluxo end-to-end:
 *
 *   Query → Classify → Route → Execute → Reflect → Feedback → Report
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { ExecutionPlan } from "./execution-plan.js";
import type { ExecutionStep } from "./execution-plan.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PipelineResult {
  /** Query original */
  query: string;
  /** Steps executados */
  steps: ReadonlyArray<ExecutionStep>;
  /** Resultado final */
  finalResult: unknown;
  /** Duração total (ms) */
  durationMs: number;
  /** Status do pipeline */
  status: "success" | "partial" | "failed";
  /** Progresso (0-100) */
  progress: number;
}

export interface StepHandler {
  /** Função que executa o step */
  execute: (input: unknown, context: PipelineContext) => Promise<unknown> | unknown;
}

export interface PipelineContext {
  /** Query original */
  query: string;
  /** Resultados acumulados de steps anteriores */
  results: Map<string, unknown>;
  /** Metadata global */
  metadata: Record<string, unknown>;
}

export interface PipelineOrchestratorConfig {
  /** Handlers por action type */
  handlers: Map<string, StepHandler>;
  /** Se deve continuar em caso de falha */
  continueOnError: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Orquestrador autônomo end-to-end do Nexus.
 *
 * @example
 * ```ts
 * const orchestrator = new PipelineOrchestrator();
 *
 * orchestrator.registerHandler("analyze", {
 *   execute: async (input) => ({ score: 85, issues: [] })
 * });
 *
 * orchestrator.registerHandler("classify", {
 *   execute: async (input) => ({ intent: "security", confidence: 0.9 })
 * });
 *
 * const result = await orchestrator.run("Fix the XSS vulnerability", [
 *   { id: "s1", name: "Analyze", action: "analyze" },
 *   { id: "s2", name: "Classify", action: "classify", dependsOn: ["s1"] },
 * ]);
 * ```
 */
export class PipelineOrchestrator {
  private handlers = new Map<string, StepHandler>();
  private config: { continueOnError: boolean };

  constructor(config?: Partial<PipelineOrchestratorConfig>) {
    this.config = {
      continueOnError: config?.continueOnError ?? true,
    };

    // Register handlers from config
    if (config?.handlers) {
      for (const [action, handler] of config.handlers) {
        this.handlers.set(action, handler);
      }
    }
  }

  /**
   * Registra um handler para um tipo de ação.
   */
  registerHandler(action: string, handler: StepHandler): void {
    this.handlers.set(action, handler);
  }

  /**
   * Executa o pipeline completo.
   */
  async run(
    query: string,
    steps: Array<Omit<ExecutionStep, "status">>,
  ): Promise<PipelineResult> {
    const plan = new ExecutionPlan({
      failFast: !this.config.continueOnError,
    });

    // Add all steps to the plan
    for (const step of steps) {
      plan.addStep(step);
    }

    // Context shared across steps
    const context: PipelineContext = {
      query,
      results: new Map(),
      metadata: {},
    };

    // Execute steps in dependency order
    let step = plan.nextStep();
    while (step) {
      const handler = this.handlers.get(step.action);

      if (!handler) {
        plan.fail(step.id, `No handler registered for action: ${step.action}`);
        step = plan.nextStep();
        continue;
      }

      plan.start(step.id);

      try {
        // Input = result of last dependency, or query
        const input = this.resolveInput(step, context);
        const result = await handler.execute(input, context);

        plan.complete(step.id, result);
        context.results.set(step.id, result);
      } catch (err) {
        plan.fail(step.id, (err as Error).message);

        if (!this.config.continueOnError) {
          break;
        }
      }

      step = plan.nextStep();
    }

    // Determine final result
    const completedSteps = plan.allSteps.filter((s) => s.status === "completed");
    const lastCompleted = completedSteps[completedSteps.length - 1];

    const status = plan.hasFailed
      ? (completedSteps.length > 0 ? "partial" : "failed")
      : "success";

    return {
      query,
      steps: plan.allSteps,
      finalResult: lastCompleted?.result ?? null,
      durationMs: plan.totalDuration,
      status,
      progress: plan.progress,
    };
  }

  /**
   * Resolve input para um step baseado em dependências.
   */
  private resolveInput(step: ExecutionStep, context: PipelineContext): unknown {
    if (step.dependsOn && step.dependsOn.length > 0) {
      // Se tem 1 dependência, retorna o resultado dela
      if (step.dependsOn.length === 1) {
        return context.results.get(step.dependsOn[0]!);
      }

      // Se tem múltiplas, retorna objeto com todos os resultados
      const inputs: Record<string, unknown> = {};
      for (const depId of step.dependsOn) {
        inputs[depId] = context.results.get(depId);
      }
      return inputs;
    }

    // Sem dependência, input é a query
    return context.query;
  }

  /** Handlers registrados */
  get handlerCount(): number {
    return this.handlers.size;
  }

  /** Actions disponíveis */
  get registeredActions(): string[] {
    return [...this.handlers.keys()];
  }
}
