/**
 * @camilooscargbaptista/nexus-core — Batch Executor
 *
 * Execução paralela de tasks independentes no DAG.
 * Agrupa tasks por nível topológico e executa cada nível em Promise.allSettled().
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BatchTask {
  id: string;
  dependencies: string[];
  execute: () => Promise<unknown>;
}

export interface BatchTaskResult {
  id: string;
  status: "completed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  duration: number;
}

export interface BatchResult {
  completed: BatchTaskResult[];
  failed: BatchTaskResult[];
  skipped: BatchTaskResult[];
  totalDuration: number;
  levels: number;
}

export interface BatchConfig {
  /** Máximo de tasks concorrentes por nível — default Infinity */
  maxConcurrency: number;
  /** Callback quando uma task completa */
  onTaskComplete?: (result: BatchTaskResult) => void;
  /** Callback quando uma task falha */
  onTaskFailed?: (result: BatchTaskResult) => void;
  /** Se deve pular tasks cujas dependências falharam — default true */
  skipOnDependencyFailure: boolean;
}

// ═══════════════════════════════════════════════════════════════
// BATCH EXECUTOR
// ═══════════════════════════════════════════════════════════════

/**
 * Executa tasks em paralelo respeitando dependências via DAG.
 *
 * @example
 * ```ts
 * const executor = new BatchExecutor();
 * const result = await executor.execute([
 *   { id: "a", dependencies: [], execute: () => fetchData() },
 *   { id: "b", dependencies: [], execute: () => fetchMore() },
 *   { id: "c", dependencies: ["a", "b"], execute: () => merge() },
 * ]);
 * // a e b rodam em paralelo, c espera ambos completarem
 * ```
 */
export class BatchExecutor {
  private config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? Infinity,
      onTaskComplete: config.onTaskComplete,
      onTaskFailed: config.onTaskFailed,
      skipOnDependencyFailure: config.skipOnDependencyFailure ?? true,
    };
  }

  /**
   * Executa todas as tasks respeitando dependências.
   * Tasks no mesmo nível topológico rodam em paralelo.
   */
  async execute(tasks: BatchTask[]): Promise<BatchResult> {
    const startTime = Date.now();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const results = new Map<string, BatchTaskResult>();
    const failedIds = new Set<string>();

    // Compute topological levels
    const levels = this.computeLevels(tasks);

    for (const level of levels) {
      // Filter tasks that should be skipped
      const executableTasks: BatchTask[] = [];
      for (const taskId of level) {
        const task = taskMap.get(taskId)!;

        // Check if any dependency failed
        if (this.config.skipOnDependencyFailure) {
          const depFailed = task.dependencies.some((d) => failedIds.has(d));
          if (depFailed) {
            const skipped: BatchTaskResult = {
              id: taskId,
              status: "skipped",
              error: "Skipped due to failed dependency",
              duration: 0,
            };
            results.set(taskId, skipped);
            failedIds.add(taskId); // Cascade the skip
            continue;
          }
        }

        executableTasks.push(task);
      }

      // Execute in batches of maxConcurrency
      for (let i = 0; i < executableTasks.length; i += this.config.maxConcurrency) {
        const batch = executableTasks.slice(i, i + this.config.maxConcurrency);

        const settledResults = await Promise.allSettled(
          batch.map((task) => this.executeTask(task)),
        );

        for (let j = 0; j < settledResults.length; j++) {
          const settled = settledResults[j]!;
          const task = batch[j]!;

          if (settled.status === "fulfilled") {
            results.set(task.id, settled.value);
            if (settled.value.status === "failed") {
              failedIds.add(task.id);
            }
          } else {
            // Promise.allSettled shouldn't really reject, but defensive
            const failed: BatchTaskResult = {
              id: task.id,
              status: "failed",
              error: String(settled.reason),
              duration: 0,
            };
            results.set(task.id, failed);
            failedIds.add(task.id);
          }
        }
      }
    }

    const allResults = Array.from(results.values());

    return {
      completed: allResults.filter((r) => r.status === "completed"),
      failed: allResults.filter((r) => r.status === "failed"),
      skipped: allResults.filter((r) => r.status === "skipped"),
      totalDuration: Date.now() - startTime,
      levels: levels.length,
    };
  }

  /**
   * Executa uma task individual com timing.
   */
  private async executeTask(task: BatchTask): Promise<BatchTaskResult> {
    const start = Date.now();

    try {
      const result = await task.execute();
      const taskResult: BatchTaskResult = {
        id: task.id,
        status: "completed",
        result,
        duration: Date.now() - start,
      };

      this.config.onTaskComplete?.(taskResult);
      return taskResult;
    } catch (error) {
      const taskResult: BatchTaskResult = {
        id: task.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      };

      this.config.onTaskFailed?.(taskResult);
      return taskResult;
    }
  }

  /**
   * Computa os níveis topológicos do DAG.
   * Nível 0 = tasks sem dependências, Nível 1 = deps só do nível 0, etc.
   */
  private computeLevels(tasks: BatchTask[]): string[][] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const task of tasks) {
      inDegree.set(task.id, 0);
      dependents.set(task.id, []);
    }

    // Build graph
    for (const task of tasks) {
      for (const dep of task.dependencies) {
        if (taskMap.has(dep)) {
          inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
          dependents.get(dep)?.push(task.id);
        }
      }
    }

    // BFS by level (Kahn's algorithm variant)
    const levels: string[][] = [];
    let queue = tasks
      .filter((t) => (inDegree.get(t.id) ?? 0) === 0)
      .map((t) => t.id);

    while (queue.length > 0) {
      levels.push([...queue]);
      const nextQueue: string[] = [];

      for (const taskId of queue) {
        for (const dependent of dependents.get(taskId) ?? []) {
          const newDegree = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            nextQueue.push(dependent);
          }
        }
      }

      queue = nextQueue;
    }

    return levels;
  }
}
