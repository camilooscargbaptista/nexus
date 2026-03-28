/**
 * @camilooscargbaptista/nexus-core — AgentOrchestrator
 *
 * Port do orchestrator.py para TypeScript.
 * Orquestra múltiplos agents com dependency resolution via Kahn's algorithm.
 * Integrado com NexusEventBus para observabilidade.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { NexusEventType, NexusLayer } from "@camilooscargbaptista/nexus-types";
import type { NexusEventBus } from "@camilooscargbaptista/nexus-events";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  SKIPPED = "skipped",
}

export interface Task {
  taskId: string;
  description: string;
  agentType: string;
  dependencies: string[];
  inputs: Record<string, unknown>;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Agent {
  name: string;
  agentType: string;
  execute: (task: Task, context: TaskContext) => Promise<unknown>;
  capabilities: string[];
}

export interface TaskContext {
  /** Resultados das tasks dependentes: { dep_{taskId}: result } */
  dependencyResults: Record<string, unknown>;
  /** Referência ao orchestrator para consultas */
  orchestrator: AgentOrchestrator;
}

export class OrchestrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationError";
  }
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private tasks: Map<string, Task> = new Map();
  private eventBus?: NexusEventBus;
  private correlationId?: string;

  constructor(eventBus?: NexusEventBus, correlationId?: string) {
    this.eventBus = eventBus;
    this.correlationId = correlationId;
  }

  // ── Agent Management ──

  registerAgent(agent: Agent): void {
    this.agents.set(agent.agentType, agent);
  }

  getAgent(agentType: string): Agent | undefined {
    return this.agents.get(agentType);
  }

  // ── Task Management ──

  addTask(
    taskId: string,
    description: string,
    agentType: string,
    dependencies: string[] = [],
    inputs: Record<string, unknown> = {},
  ): Task {
    if (this.tasks.has(taskId)) {
      throw new OrchestrationError(`Task '${taskId}' already exists`);
    }

    // Validate dependencies exist
    for (const dep of dependencies) {
      if (!this.tasks.has(dep)) {
        throw new OrchestrationError(
          `Dependency '${dep}' not found for task '${taskId}'. Tasks must be added in order.`,
        );
      }
    }

    const task: Task = {
      taskId,
      description,
      agentType,
      dependencies,
      inputs,
      status: TaskStatus.PENDING,
    };

    this.tasks.set(taskId, task);
    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId)?.status;
  }

  // ── Execution ──

  async executeTask(taskId: string): Promise<unknown> {
    const task = this.tasks.get(taskId);
    if (!task) throw new OrchestrationError(`Task '${taskId}' not found`);

    // Check dependencies
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (!dep || dep.status !== TaskStatus.COMPLETED) {
        throw new OrchestrationError(
          `Dependency '${depId}' not completed for task '${taskId}'`,
        );
      }
    }

    // Find agent
    const agent = this.findAgentForTask(task);
    if (!agent) {
      task.status = TaskStatus.FAILED;
      task.error = `No agent found for type '${task.agentType}'`;
      throw new OrchestrationError(task.error);
    }

    // Build context with dependency results
    const dependencyResults: Record<string, unknown> = {};
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId)!;
      dependencyResults[`dep_${depId}`] = dep.result;
    }

    const context: TaskContext = {
      dependencyResults,
      orchestrator: this,
    };

    // Execute
    task.status = TaskStatus.RUNNING;
    task.startedAt = Date.now();

    this.emitTaskEvent(task, "started");

    try {
      task.result = await agent.execute(task, context);
      task.status = TaskStatus.COMPLETED;
      task.completedAt = Date.now();
      this.emitTaskEvent(task, "completed");
      return task.result;
    } catch (err) {
      task.status = TaskStatus.FAILED;
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();
      this.emitTaskEvent(task, "failed");
      throw err;
    }
  }

  /**
   * Executa todas as tasks em ordem topológica.
   * Tasks sem dependências podem rodar em paralelo (futuro: parallel execution).
   */
  async executePipeline(): Promise<Map<string, unknown>> {
    const order = this.topologicalSort();
    const results = new Map<string, unknown>();

    for (const taskId of order) {
      const task = this.tasks.get(taskId)!;

      // Skip if already completed or failed
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        if (task.result !== undefined) results.set(taskId, task.result);
        continue;
      }

      // Skip if any dependency failed
      const depFailed = task.dependencies.some(
        (dep) => this.tasks.get(dep)?.status === TaskStatus.FAILED,
      );

      if (depFailed) {
        task.status = TaskStatus.SKIPPED;
        task.error = "Skipped due to failed dependency";
        this.emitTaskEvent(task, "skipped");
        continue;
      }

      try {
        const result = await this.executeTask(taskId);
        results.set(taskId, result);
      } catch {
        // Task already marked as FAILED in executeTask
      }
    }

    return results;
  }

  /**
   * Agrega resultados de tasks específicas ou todas.
   */
  aggregateResults(taskIds?: string[]): Record<string, unknown> {
    const ids = taskIds || Array.from(this.tasks.keys());
    const aggregated: Record<string, unknown> = {};

    for (const id of ids) {
      const task = this.tasks.get(id);
      if (task?.status === TaskStatus.COMPLETED && task.result !== undefined) {
        aggregated[id] = task.result;
      }
    }

    return aggregated;
  }

  /**
   * Reseta todas as tasks para PENDING.
   */
  reset(): void {
    for (const task of this.tasks.values()) {
      task.status = TaskStatus.PENDING;
      task.result = undefined;
      task.error = undefined;
      task.startedAt = undefined;
      task.completedAt = undefined;
    }
  }

  // ── Topological Sort (Kahn's Algorithm) ──

  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const [taskId, task] of this.tasks) {
      inDegree.set(taskId, task.dependencies.length);
      if (!adjacency.has(taskId)) adjacency.set(taskId, []);

      for (const dep of task.dependencies) {
        const adj = adjacency.get(dep) || [];
        adj.push(taskId);
        adjacency.set(dep, adj);
      }
    }

    // Find all nodes with in-degree 0
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) queue.push(taskId);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (sorted.length !== this.tasks.size) {
      throw new OrchestrationError("Circular dependency detected in task graph");
    }

    return sorted;
  }

  // ── Private ──

  private findAgentForTask(task: Task): Agent | undefined {
    return this.agents.get(task.agentType);
  }

  private emitTaskEvent(task: Task, action: string): void {
    if (!this.eventBus) return;

    const eventType =
      action === "completed"
        ? NexusEventType.PIPELINE_COMPLETED
        : action === "failed" || action === "skipped"
          ? NexusEventType.ERROR_OCCURRED
          : NexusEventType.PIPELINE_STARTED;

    this.eventBus.publish(
      eventType,
      NexusLayer.AUTONOMY,
      {
        taskId: task.taskId,
        action,
        agentType: task.agentType,
        status: task.status,
        error: task.error,
        duration: task.startedAt && task.completedAt
          ? task.completedAt - task.startedAt
          : undefined,
      },
      { projectPath: "." },
      this.correlationId,
    );
  }
}
