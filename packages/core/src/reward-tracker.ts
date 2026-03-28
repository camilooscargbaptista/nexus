/**
 * @camilooscargbaptista/nexus-core — Reward Tracker
 *
 * Rastreia recompensas (rewards) de ações do Nexus.
 * Feedback positivo/negativo para calibrar futuras recomendações.
 *
 * Inspirado em RLHF (Reinforcement Learning from Human Feedback).
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RewardEntry {
  /** ID único do reward */
  id: string;
  /** ID da ação/recomendação que gerou o reward */
  actionId: string;
  /** Tipo da ação */
  actionType: string;
  /** Reward score (-1 a 1) */
  reward: number;
  /** Sinal: positivo ou negativo */
  signal: "positive" | "negative" | "neutral";
  /** Timestamp */
  timestamp: number;
  /** Razão do reward */
  reason?: string;
  /** Metadata adicional */
  metadata?: Record<string, unknown>;
}

export interface RewardSummary {
  /** Total de rewards */
  totalRewards: number;
  /** Média de reward */
  averageReward: number;
  /** Rewards positivos */
  positiveCount: number;
  /** Rewards negativos */
  negativeCount: number;
  /** Rewards neutros */
  neutralCount: number;
  /** Taxa de sucesso (%) */
  successRate: number;
  /** Trend recente (últimos N) */
  recentTrend: "improving" | "stable" | "degrading";
  /** Rewards por tipo de ação */
  byActionType: Map<string, { count: number; avgReward: number }>;
}

export interface RewardTrackerConfig {
  /** Tamanho da janela para trend — default 10 */
  trendWindow: number;
  /** Threshold para considerar "neutro" — default 0.1 */
  neutralThreshold: number;
}

// ═══════════════════════════════════════════════════════════════
// REWARD TRACKER
// ═══════════════════════════════════════════════════════════════

/**
 * Rastreia rewards de ações do Nexus para feedback loop.
 *
 * @example
 * ```ts
 * const tracker = new RewardTracker();
 * tracker.record({ actionId: "rec-1", actionType: "refactor", reward: 0.8, reason: "user accepted" });
 * tracker.record({ actionId: "rec-2", actionType: "security", reward: -0.5, reason: "false positive" });
 *
 * const summary = tracker.summarize();
 * // summary.successRate === 50
 * // summary.recentTrend === "stable"
 * ```
 */
export class RewardTracker {
  private entries: RewardEntry[] = [];
  private config: RewardTrackerConfig;
  private nextId = 0;

  constructor(config?: Partial<RewardTrackerConfig>) {
    this.config = {
      trendWindow: config?.trendWindow ?? 10,
      neutralThreshold: config?.neutralThreshold ?? 0.1,
    };
  }

  /**
   * Registra um reward.
   */
  record(entry: Omit<RewardEntry, "id" | "timestamp" | "signal">): RewardEntry {
    const signal = this.classifySignal(entry.reward);
    const full: RewardEntry = {
      ...entry,
      id: `rw-${++this.nextId}`,
      timestamp: Date.now(),
      signal,
    };

    this.entries.push(full);
    return full;
  }

  /**
   * Registra reward positivo simplificado.
   */
  thumbsUp(actionId: string, actionType: string, reason?: string): RewardEntry {
    return this.record({ actionId, actionType, reward: 1.0, reason });
  }

  /**
   * Registra reward negativo simplificado.
   */
  thumbsDown(actionId: string, actionType: string, reason?: string): RewardEntry {
    return this.record({ actionId, actionType, reward: -1.0, reason });
  }

  /**
   * Gera sumário de todos os rewards.
   */
  summarize(): RewardSummary {
    if (this.entries.length === 0) {
      return {
        totalRewards: 0,
        averageReward: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        successRate: 0,
        recentTrend: "stable",
        byActionType: new Map(),
      };
    }

    const positiveCount = this.entries.filter((e) => e.signal === "positive").length;
    const negativeCount = this.entries.filter((e) => e.signal === "negative").length;
    const neutralCount = this.entries.filter((e) => e.signal === "neutral").length;

    const averageReward = this.entries.reduce((sum, e) => sum + e.reward, 0) / this.entries.length;
    const successRate = Math.round((positiveCount / this.entries.length) * 100);

    // By action type
    const byActionType = new Map<string, { count: number; avgReward: number }>();
    for (const entry of this.entries) {
      const existing = byActionType.get(entry.actionType);
      if (existing) {
        existing.count++;
        existing.avgReward = (existing.avgReward * (existing.count - 1) + entry.reward) / existing.count;
      } else {
        byActionType.set(entry.actionType, { count: 1, avgReward: entry.reward });
      }
    }

    // Recent trend
    const recentTrend = this.computeTrend();

    return {
      totalRewards: this.entries.length,
      averageReward: Math.round(averageReward * 100) / 100,
      positiveCount,
      negativeCount,
      neutralCount,
      successRate,
      recentTrend,
      byActionType,
    };
  }

  /**
   * Retorna o reward médio para um tipo de ação específico.
   */
  getActionTypeReward(actionType: string): number {
    const filtered = this.entries.filter((e) => e.actionType === actionType);
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, e) => sum + e.reward, 0) / filtered.length;
  }

  /**
   * Retorna os N melhores e piores tipos de ação.
   */
  getTopActions(n: number = 5): { best: string[]; worst: string[] } {
    const summary = this.summarize();
    const sorted = [...summary.byActionType.entries()].sort((a, b) => b[1].avgReward - a[1].avgReward);

    return {
      best: sorted.slice(0, n).map(([type]) => type),
      worst: sorted.slice(-n).reverse().map(([type]) => type),
    };
  }

  /** Total de rewards registrados */
  get count(): number {
    return this.entries.length;
  }

  /** Todos os entries */
  get all(): ReadonlyArray<RewardEntry> {
    return this.entries;
  }

  /**
   * Classifica o sinal do reward.
   */
  private classifySignal(reward: number): RewardEntry["signal"] {
    if (Math.abs(reward) <= this.config.neutralThreshold) return "neutral";
    return reward > 0 ? "positive" : "negative";
  }

  /**
   * Computa trend baseado nos últimos N rewards.
   */
  private computeTrend(): RewardSummary["recentTrend"] {
    const window = this.config.trendWindow;
    if (this.entries.length < window) return "stable";

    const recent = this.entries.slice(-window);
    const firstHalf = recent.slice(0, Math.floor(window / 2));
    const secondHalf = recent.slice(Math.floor(window / 2));

    const firstAvg = firstHalf.reduce((s, e) => s + e.reward, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, e) => s + e.reward, 0) / secondHalf.length;

    const delta = secondAvg - firstAvg;
    if (delta > 0.15) return "improving";
    if (delta < -0.15) return "degrading";
    return "stable";
  }
}
