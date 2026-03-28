/**
 * @camilooscargbaptista/nexus-core — RateLimiter
 *
 * Sliding window rate limiter com mutex para thread-safety.
 * Protege APIs upstream (Anthropic, OpenAI) e o Cloud API.
 * Zero dependências externas.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Configuração do rate limiter */
export interface RateLimiterConfig {
  /** Número máximo de requests na janela */
  maxRequests: number;
  /** Tamanho da janela em ms */
  windowMs: number;
}

/** Resultado de uma tentativa de acquire() */
export interface AcquireResult {
  /** Se o request foi permitido */
  allowed: boolean;
  /** Requests restantes na janela */
  remaining: number;
  /** Ms até o próximo slot disponível (0 se allowed) */
  retryAfterMs: number;
}

/** Estatísticas do rate limiter */
export interface RateLimiterStats {
  /** Total de requests permitidos */
  totalAllowed: number;
  /** Total de requests rejeitados */
  totalRejected: number;
  /** Requests ativos na janela atual */
  activeInWindow: number;
  /** Capacidade configurada */
  maxRequests: number;
  /** Janela configurada em ms */
  windowMs: number;
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private timestamps: number[] = [];
  private mutex: Promise<void> = Promise.resolve();

  // Stats
  private allowedCount = 0;
  private rejectedCount = 0;

  constructor(config: RateLimiterConfig) {
    this.config = { ...config };
  }

  /**
   * Tenta adquirir um slot. Retorna imediatamente.
   * Se não há slot, retorna allowed: false com retryAfterMs.
   */
  async acquire(): Promise<AcquireResult> {
    return this.withMutex(() => {
      this.purgeExpired();

      if (this.timestamps.length < this.config.maxRequests) {
        this.timestamps.push(Date.now());
        this.allowedCount++;
        return {
          allowed: true,
          remaining: this.config.maxRequests - this.timestamps.length,
          retryAfterMs: 0,
        };
      }

      // Janela cheia — calcular quando o slot mais antigo expira
      const oldestTimestamp = this.timestamps[0]!;
      const retryAfterMs =
        oldestTimestamp + this.config.windowMs - Date.now();

      this.rejectedCount++;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    });
  }

  /**
   * Espera até que um slot esteja disponível, depois adquire.
   * Timeout opcional para evitar deadlocks.
   */
  async waitForSlot(timeoutMs?: number): Promise<AcquireResult> {
    const startTime = Date.now();

    while (true) {
      const result = await this.acquire();

      if (result.allowed) {
        return result;
      }

      // Check timeout
      if (timeoutMs !== undefined) {
        const elapsed = Date.now() - startTime;
        if (elapsed + result.retryAfterMs > timeoutMs) {
          return {
            allowed: false,
            remaining: 0,
            retryAfterMs: result.retryAfterMs,
          };
        }
      }

      // Espera até o próximo slot
      const waitTime = Math.max(1, result.retryAfterMs);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  /**
   * Reseta o rate limiter (limpa timestamps e stats).
   */
  reset(): void {
    this.timestamps = [];
    this.allowedCount = 0;
    this.rejectedCount = 0;
  }

  /**
   * Retorna estatísticas do rate limiter.
   */
  stats(): RateLimiterStats {
    this.purgeExpired();
    return {
      totalAllowed: this.allowedCount,
      totalRejected: this.rejectedCount,
      activeInWindow: this.timestamps.length,
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Remove timestamps fora da janela atual (sliding window).
   */
  private purgeExpired(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);
  }

  /**
   * Mutex simples via Promise chain — garante acesso serial ao state.
   */
  private withMutex<T>(fn: () => T): Promise<T> {
    const result = this.mutex.then(() => fn());
    // Chain a new promise regardless of result
    this.mutex = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
