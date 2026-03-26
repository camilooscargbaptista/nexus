/**
 * @nexus/core — FallbackChain
 *
 * Port do fallback.py para TypeScript.
 * Retry strategies com exponential/linear backoff e chain de fallback steps.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export enum RetryStrategy {
  EXPONENTIAL_BACKOFF = "exponential",
  LINEAR_BACKOFF = "linear",
  FIXED = "fixed",
  IMMEDIATE = "immediate",
}

export interface FallbackStep<T = unknown> {
  fn: (...args: unknown[]) => T | Promise<T>;
  description: string;
  maxRetries: number;
  retryStrategy: RetryStrategy;
  initialDelay: number; // ms
  maxDelay: number; // ms
}

export interface FallbackExecutionRecord {
  step: number;
  description: string;
  status: "success" | "error";
  result?: unknown;
  error?: string;
  attempts: number;
  timestamp: string;
  duration: number;
}

export class FallbackChainError extends Error {
  public readonly records: FallbackExecutionRecord[];

  constructor(message: string, records: FallbackExecutionRecord[]) {
    super(message);
    this.name = "FallbackChainError";
    this.records = records;
  }
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK CHAIN
// ═══════════════════════════════════════════════════════════════

export class FallbackChain<T = unknown> {
  private steps: FallbackStep<T>[] = [];
  private executionHistory: FallbackExecutionRecord[] = [];

  /**
   * Adiciona um step ao chain.
   */
  addStep(
    fn: (...args: unknown[]) => T | Promise<T>,
    options: {
      description?: string;
      maxRetries?: number;
      retryStrategy?: RetryStrategy;
      initialDelay?: number;
      maxDelay?: number;
    } = {},
  ): this {
    this.steps.push({
      fn,
      description: options.description || `Step ${this.steps.length + 1}`,
      maxRetries: options.maxRetries ?? 3,
      retryStrategy: options.retryStrategy ?? RetryStrategy.EXPONENTIAL_BACKOFF,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 60_000,
    });
    return this;
  }

  /**
   * Executa os steps em sequência. Retorna o resultado do primeiro que suceder.
   * Se todos falharem, joga FallbackChainError.
   */
  async execute(...args: unknown[]): Promise<T> {
    const records: FallbackExecutionRecord[] = [];

    for (let stepIdx = 0; stepIdx < this.steps.length; stepIdx++) {
      const step = this.steps[stepIdx]!;
      const record = await this.executeWithRetry(step, stepIdx, args);
      records.push(record);
      this.executionHistory.push(record);

      if (record.status === "success") {
        return record.result as T;
      }
    }

    throw new FallbackChainError(
      `All ${this.steps.length} fallback steps failed`,
      records,
    );
  }

  getExecutionHistory(): FallbackExecutionRecord[] {
    return [...this.executionHistory];
  }

  clearHistory(): void {
    this.executionHistory = [];
  }

  get stepCount(): number {
    return this.steps.length;
  }

  // ── Private ──

  private async executeWithRetry(
    step: FallbackStep<T>,
    stepIdx: number,
    args: unknown[],
  ): Promise<FallbackExecutionRecord> {
    const totalAttempts = step.maxRetries + 1; // initial + retries
    let lastError: string | undefined;
    const start = Date.now();

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      // Wait between retries (not before first attempt)
      if (attempt > 0) {
        const delay = this.calculateDelay(
          attempt,
          step.retryStrategy,
          step.initialDelay,
          step.maxDelay,
        );
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      try {
        const result = await Promise.resolve(step.fn(...args));
        return {
          step: stepIdx,
          description: step.description,
          status: "success",
          result,
          attempts: attempt + 1,
          timestamp: new Date().toISOString(),
          duration: Date.now() - start,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      step: stepIdx,
      description: step.description,
      status: "error",
      error: lastError,
      attempts: totalAttempts,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    };
  }

  private calculateDelay(
    attempt: number,
    strategy: RetryStrategy,
    initialDelay: number,
    maxDelay: number,
  ): number {
    let delay: number;

    switch (strategy) {
      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = initialDelay * Math.pow(2, attempt - 1);
        break;
      case RetryStrategy.LINEAR_BACKOFF:
        delay = initialDelay * attempt;
        break;
      case RetryStrategy.FIXED:
        delay = initialDelay;
        break;
      case RetryStrategy.IMMEDIATE:
        return 0;
    }

    return Math.min(delay, maxDelay);
  }
}
