/**
 * @nexus/bridge — Execution Plan
 *
 * Plano de execução que descreve uma sequência de passos
 * a serem executados pelo pipeline autônomo.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface ExecutionStep {
  /** ID único do step */
  id: string;
  /** Nome descritivo */
  name: string;
  /** Tipo de ação */
  action: string;
  /** Status atual */
  status: StepStatus;
  /** Resultado (preenchido após execução) */
  result?: unknown;
  /** Erro (se falhou) */
  error?: string;
  /** Duração (ms) */
  durationMs?: number;
  /** IDs dos steps que devem completar antes */
  dependsOn?: string[];
}

export interface ExecutionPlanConfig {
  /** Se deve parar na primeira falha — default false */
  failFast: boolean;
  /** Timeout total (ms) — default 60000 */
  timeout: number;
  /** Se deve pular steps com dependências falhadas — default true */
  skipOnFailedDependency: boolean;
}

// ═══════════════════════════════════════════════════════════════
// EXECUTION PLAN
// ═══════════════════════════════════════════════════════════════

/**
 * Plano de execução para o pipeline autônomo.
 *
 * @example
 * ```ts
 * const plan = new ExecutionPlan();
 * plan.addStep({ id: "analyze", name: "Analyze codebase", action: "analyze" });
 * plan.addStep({ id: "classify", name: "Classify intent", action: "classify", dependsOn: ["analyze"] });
 *
 * const next = plan.nextStep();
 * plan.complete("analyze", { score: 85 });
 * ```
 */
export class ExecutionPlan {
  private steps: ExecutionStep[] = [];
  private config: ExecutionPlanConfig;
  private startTime: number | null = null;

  constructor(config?: Partial<ExecutionPlanConfig>) {
    this.config = {
      failFast: config?.failFast ?? false,
      timeout: config?.timeout ?? 60000,
      skipOnFailedDependency: config?.skipOnFailedDependency ?? true,
    };
  }

  /**
   * Adiciona um step ao plano.
   */
  addStep(step: Omit<ExecutionStep, "status">): void {
    this.steps.push({ ...step, status: "pending" });
  }

  /**
   * Retorna o próximo step a executar.
   */
  nextStep(): ExecutionStep | undefined {
    if (this.config.failFast && this.hasFailed) return undefined;

    for (const step of this.steps) {
      if (step.status !== "pending") continue;

      // Check dependencies
      if (step.dependsOn && step.dependsOn.length > 0) {
        const depsReady = step.dependsOn.every((depId) => {
          const dep = this.steps.find((s) => s.id === depId);
          return dep?.status === "completed";
        });

        const depsFailed = step.dependsOn.some((depId) => {
          const dep = this.steps.find((s) => s.id === depId);
          return dep?.status === "failed";
        });

        if (depsFailed && this.config.skipOnFailedDependency) {
          step.status = "skipped";
          continue;
        }

        if (!depsReady) continue;
      }

      return step;
    }

    return undefined;
  }

  /**
   * Marca um step como em execução.
   */
  start(stepId: string): void {
    if (!this.startTime) this.startTime = Date.now();
    const step = this.findStep(stepId);
    if (step) step.status = "running";
  }

  /**
   * Marca um step como completado.
   */
  complete(stepId: string, result?: unknown): void {
    const step = this.findStep(stepId);
    if (step) {
      step.status = "completed";
      step.result = result;
    }
  }

  /**
   * Marca um step como falhado.
   */
  fail(stepId: string, error: string): void {
    const step = this.findStep(stepId);
    if (step) {
      step.status = "failed";
      step.error = error;
    }
  }

  /** Todas as steps */
  get allSteps(): ReadonlyArray<ExecutionStep> {
    return this.steps;
  }

  /** Se algum step falhou */
  get hasFailed(): boolean {
    return this.steps.some((s) => s.status === "failed");
  }

  /** Se todos completaram */
  get isComplete(): boolean {
    return this.steps.every((s) => s.status === "completed" || s.status === "skipped");
  }

  /** Progresso (0-100) */
  get progress(): number {
    if (this.steps.length === 0) return 100;
    const done = this.steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
    return Math.round((done / this.steps.length) * 100);
  }

  /** Duração total */
  get totalDuration(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  /** Step count */
  get stepCount(): number {
    return this.steps.length;
  }

  private findStep(id: string): ExecutionStep | undefined {
    return this.steps.find((s) => s.id === id);
  }
}
