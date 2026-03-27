/**
 * @nexus/core — ResilientHttpClient
 *
 * HTTP client com retry, circuit breaker e timeout.
 * Zero dependências externas — usa native fetch.
 *
 * Inspirado no httpx resiliente do mcp-brasil.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { RetryStrategy } from "./fallback.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Estado do circuit breaker */
export enum CircuitBreakerState {
  /** Circuito fechado — requests passam normalmente */
  CLOSED = "closed",
  /** Circuito aberto — requests rejeitados imediatamente */
  OPEN = "open",
  /** Circuito semi-aberto — permite 1 request de teste */
  HALF_OPEN = "half_open",
}

/** Configuração do ResilientHttpClient */
export interface ResilientHttpConfig {
  /** Número máximo de retries por request (default: 3) */
  maxRetries: number;
  /** Estratégia de retry (default: EXPONENTIAL_BACKOFF) */
  retryStrategy: RetryStrategy;
  /** Delay inicial entre retries em ms (default: 1000) */
  initialDelay: number;
  /** Delay máximo entre retries em ms (default: 30000) */
  maxDelay: number;
  /** Timeout por request em ms (default: 30000) */
  requestTimeout: number;
  /** Número de falhas para abrir o circuit breaker (default: 5) */
  circuitBreakerThreshold: number;
  /** Tempo em ms que o circuito fica aberto antes de tentar half-open (default: 60000) */
  circuitBreakerResetTimeout: number;
  /** HTTP status codes que devem triggerar retry (default: [429, 500, 502, 503, 504]) */
  retryableStatuses: number[];
  /** Adicionar jitter ao delay (default: true) */
  jitter: boolean;
}

/** Opções para um request individual */
export interface HttpRequestOptions extends RequestInit {
  /** Override timeout para este request específico */
  timeout?: number;
  /** Override maxRetries para este request específico */
  maxRetries?: number;
  /** Skip circuit breaker check (para health checks) */
  skipCircuitBreaker?: boolean;
}

/** Resultado com metadata de resiliência */
export interface ResilientResponse {
  /** Response do fetch */
  response: Response;
  /** Número de attempts até sucesso */
  attempts: number;
  /** Duração total em ms */
  duration: number;
  /** Se veio de retry */
  retried: boolean;
}

/** Métricas do client */
export interface HttpClientMetrics {
  /** Total de requests feitos */
  totalRequests: number;
  /** Requests com sucesso */
  successfulRequests: number;
  /** Requests que falharam após todos os retries */
  failedRequests: number;
  /** Total de retries feitos */
  totalRetries: number;
  /** Vezes que o circuit breaker abriu */
  circuitBreakerTrips: number;
  /** Timeouts ocorridos */
  timeouts: number;
  /** Estado atual do circuit breaker */
  circuitBreakerState: CircuitBreakerState;
}

// ═══════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════

/** Erro quando o circuit breaker está aberto */
export class CircuitBreakerOpenError extends Error {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Circuit breaker is OPEN. Retry after ${retryAfterMs}ms`);
    this.name = "CircuitBreakerOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Erro quando o request excede o timeout */
export class HttpTimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly url: string;

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}

/** Erro quando todos os retries falharam */
export class HttpExhaustedRetriesError extends Error {
  public readonly attempts: number;
  public readonly lastStatus?: number;
  public readonly url: string;

  constructor(url: string, attempts: number, lastStatus?: number) {
    super(
      `All ${attempts} attempts to ${url} failed${lastStatus ? ` (last status: ${lastStatus})` : ""}`,
    );
    this.name = "HttpExhaustedRetriesError";
    this.attempts = attempts;
    this.lastStatus = lastStatus;
    this.url = url;
  }
}

// ═══════════════════════════════════════════════════════════════
// RESILIENT HTTP CLIENT
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: ResilientHttpConfig = {
  maxRetries: 3,
  retryStrategy: RetryStrategy.EXPONENTIAL_BACKOFF,
  initialDelay: 1000,
  maxDelay: 30_000,
  requestTimeout: 30_000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetTimeout: 60_000,
  retryableStatuses: [429, 500, 502, 503, 504],
  jitter: true,
};

export class ResilientHttpClient {
  private readonly config: ResilientHttpConfig;

  // Circuit breaker state
  private circuitState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  // Metrics
  private metrics: HttpClientMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalRetries: 0,
    circuitBreakerTrips: 0,
    timeouts: 0,
    circuitBreakerState: CircuitBreakerState.CLOSED,
  };

  constructor(config: Partial<ResilientHttpConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Executa um HTTP request com retry, circuit breaker e timeout.
   */
  async fetch(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<ResilientResponse> {
    this.metrics.totalRequests++;
    const startTime = Date.now();
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const totalAttempts = maxRetries + 1;

    // Circuit breaker check
    if (!options.skipCircuitBreaker) {
      this.checkCircuitBreaker();
    }

    let lastError: Error | undefined;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      // Backoff entre retries (não antes do primeiro attempt)
      if (attempt > 0) {
        this.metrics.totalRetries++;
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }

      try {
        const response = await this.executeWithTimeout(url, options);

        // Se o status é retryable, tentar novamente
        if (
          this.config.retryableStatuses.includes(response.status) &&
          attempt < totalAttempts - 1
        ) {
          lastStatus = response.status;

          // Respeitar Retry-After header se presente
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const retryMs = parseInt(retryAfter, 10) * 1000;
            if (!isNaN(retryMs) && retryMs > 0) {
              await this.sleep(Math.min(retryMs, this.config.maxDelay));
            }
          }

          continue;
        }

        // Sucesso (ou non-retryable status)
        this.onSuccess();
        return {
          response,
          attempts: attempt + 1,
          duration: Date.now() - startTime,
          retried: attempt > 0,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof HttpTimeoutError) {
          this.metrics.timeouts++;
        }

        // Se é o último attempt, não continuar
        if (attempt >= totalAttempts - 1) {
          break;
        }
      }
    }

    // Todos os attempts falharam
    this.onFailure();
    this.metrics.failedRequests++;

    if (lastError) {
      throw lastError;
    }

    throw new HttpExhaustedRetriesError(url, totalAttempts, lastStatus);
  }

  /**
   * Retorna métricas do client.
   */
  getMetrics(): HttpClientMetrics {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitState,
    };
  }

  /**
   * Reseta métricas e circuit breaker.
   */
  reset(): void {
    this.circuitState = CircuitBreakerState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      circuitBreakerTrips: 0,
      timeouts: 0,
      circuitBreakerState: CircuitBreakerState.CLOSED,
    };
  }

  /**
   * Retorna o estado atual do circuit breaker.
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitState;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Verifica o circuit breaker antes de fazer um request.
   */
  private checkCircuitBreaker(): void {
    if (this.circuitState === CircuitBreakerState.CLOSED) {
      return;
    }

    if (this.circuitState === CircuitBreakerState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.circuitBreakerResetTimeout) {
        // Transição para HALF_OPEN — permite um request de teste
        this.circuitState = CircuitBreakerState.HALF_OPEN;
        return;
      }
      throw new CircuitBreakerOpenError(
        this.config.circuitBreakerResetTimeout - elapsed,
      );
    }

    // HALF_OPEN — permite o request (se falhar, volta para OPEN)
  }

  /**
   * Executa o fetch com timeout via AbortController.
   */
  private async executeWithTimeout(
    url: string,
    options: HttpRequestOptions,
  ): Promise<Response> {
    const timeoutMs = options.timeout ?? this.config.requestTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { timeout: _, maxRetries: __, skipCircuitBreaker: ___, ...fetchOptions } = options;
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new HttpTimeoutError(url, timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Callback em caso de sucesso — reseta o circuit breaker.
   */
  private onSuccess(): void {
    this.metrics.successfulRequests++;
    this.consecutiveFailures = 0;

    if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      // Request de teste passou — circuito fecha
      this.circuitState = CircuitBreakerState.CLOSED;
    }
  }

  /**
   * Callback em caso de falha — incrementa contador e potencialmente abre o circuito.
   */
  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (
      this.circuitState !== CircuitBreakerState.OPEN &&
      this.consecutiveFailures >= this.config.circuitBreakerThreshold
    ) {
      this.circuitState = CircuitBreakerState.OPEN;
      this.metrics.circuitBreakerTrips++;
    }

    if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      // Request de teste falhou — circuito reabre
      this.circuitState = CircuitBreakerState.OPEN;
      this.metrics.circuitBreakerTrips++;
    }
  }

  /**
   * Calcula o delay entre retries com backoff + jitter opcional.
   */
  private calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.retryStrategy) {
      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = this.config.initialDelay * Math.pow(2, attempt - 1);
        break;
      case RetryStrategy.LINEAR_BACKOFF:
        delay = this.config.initialDelay * attempt;
        break;
      case RetryStrategy.FIXED:
        delay = this.config.initialDelay;
        break;
      case RetryStrategy.IMMEDIATE:
        return 0;
    }

    // Jitter: adiciona ±25% de variação
    if (this.config.jitter) {
      const jitterRange = delay * 0.25;
      delay += Math.random() * jitterRange * 2 - jitterRange;
    }

    return Math.min(Math.max(0, delay), this.config.maxDelay);
  }

  /**
   * Sleep helper — util para testes (pode ser mockado).
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
