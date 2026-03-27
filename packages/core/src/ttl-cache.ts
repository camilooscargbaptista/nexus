/**
 * @nexus/core — TTLCache
 *
 * Cache in-memory com TTL (Time-To-Live) e LRU (Least Recently Used) eviction.
 * Zero dependências externas.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Configuração do cache */
export interface TTLCacheConfig {
  /** TTL padrão em ms (default: 300_000 = 5min) */
  defaultTTL: number;
  /** Tamanho máximo do cache (default: 1000) */
  maxSize: number;
  /** Intervalo de cleanup automático em ms (0 = desabilitado, default: 60_000) */
  cleanupInterval: number;
}

/** Estatísticas do cache */
export interface CacheStats {
  /** Número de entries no cache */
  size: number;
  /** Total de hits */
  hits: number;
  /** Total de misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Número de evictions por LRU */
  evictions: number;
  /** Número de entries expiradas removidas */
  expirations: number;
}

/** Entry interna do cache */
interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  /** Contador monotônico para LRU — maior = mais recente */
  accessOrder: number;
}

// ═══════════════════════════════════════════════════════════════
// TTL CACHE
// ═══════════════════════════════════════════════════════════════

export class TTLCache<K = string, V = unknown> {
  private readonly config: TTLCacheConfig;
  private readonly store = new Map<K, CacheEntry<V>>();

  // Stats
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private expirationCount = 0;
  /** Contador monotônico para LRU ordering */
  private accessCounter = 0;

  // Cleanup timer
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<TTLCacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL ?? 300_000,
      maxSize: config.maxSize ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 60_000,
    };

    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(
        () => this.cleanup(),
        this.config.cleanupInterval,
      );
      // Permite que o processo encerre sem esperar o timer
      if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Retorna o valor associado à key, ou undefined se não existe ou expirou.
   */
  get(key: K): V | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Verifica expiração
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.expirationCount++;
      this.missCount++;
      return undefined;
    }

    // Atualiza LRU
    entry.accessOrder = ++this.accessCounter;
    this.hitCount++;
    return entry.value;
  }

  /**
   * Define um valor no cache com TTL opcional.
   */
  set(key: K, value: V, ttl?: number): void {
    const effectiveTTL = ttl ?? this.config.defaultTTL;

    // Se o key já existe, atualiza in-place
    if (this.store.has(key)) {
      const entry = this.store.get(key)!;
      entry.value = value;
      entry.expiresAt = Date.now() + effectiveTTL;
      entry.accessOrder = ++this.accessCounter;
      return;
    }

    // Eviction se necessário
    if (this.store.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + effectiveTTL,
      accessOrder: ++this.accessCounter,
    });
  }

  /**
   * Verifica se a key existe e não expirou.
   */
  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.expirationCount++;
      return false;
    }

    return true;
  }

  /**
   * Remove uma key do cache.
   */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /**
   * Retorna o valor se existe, ou executa o factory para popular o cache.
   */
  async getOrSet(
    key: K,
    factory: () => V | Promise<V>,
    ttl?: number,
  ): Promise<V> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = await Promise.resolve(factory());
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Limpa todo o cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Retorna o número de entries (incluindo potencialmente expiradas).
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Retorna estatísticas do cache.
   */
  stats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount;
    return {
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      evictions: this.evictionCount,
      expirations: this.expirationCount,
    };
  }

  /**
   * Reseta as estatísticas (mantém os dados).
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
    this.expirationCount = 0;
  }

  /**
   * Destrói o cache e para o cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Remove a entry menos acessada (LRU).
   */
  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.accessOrder < oldestTime) {
        oldestTime = entry.accessOrder;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
      this.evictionCount++;
    }
  }

  /**
   * Remove entries expiradas.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        this.expirationCount++;
      }
    }
  }
}
