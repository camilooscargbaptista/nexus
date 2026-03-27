/**
 * @nexus/core — Feedback Collector
 *
 * Coleta feedback estruturado de múltiplas fontes:
 * - Usuário direto (accept/reject)
 * - Sistema (constitution score)
 * - Automático (metrics delta)
 *
 * Converte tudo em RewardEntry para o RewardTracker.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { RewardTracker } from "./reward-tracker.js";
import type { RewardEntry } from "./reward-tracker.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type FeedbackSource = "user" | "system" | "auto" | "constitution";

export interface FeedbackEvent {
  /** Fonte do feedback */
  source: FeedbackSource;
  /** ID da ação avaliada */
  actionId: string;
  /** Tipo da ação */
  actionType: string;
  /** Feedback: accepted, rejected, partial, timeout */
  outcome: "accepted" | "rejected" | "partial" | "timeout";
  /** Score detalhado (0-100) — opcional */
  score?: number;
  /** Razão textual */
  reason?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface FeedbackCollectorConfig {
  /** Peso por fonte */
  sourceWeights: Record<FeedbackSource, number>;
  /** Se deve registrar automaticamente no tracker */
  autoRecord: boolean;
}

// ═══════════════════════════════════════════════════════════════
// FEEDBACK COLLECTOR
// ═══════════════════════════════════════════════════════════════

/**
 * Coleta feedback de múltiplas fontes e converte em rewards.
 *
 * @example
 * ```ts
 * const tracker = new RewardTracker();
 * const collector = new FeedbackCollector(tracker);
 *
 * collector.collect({
 *   source: "user",
 *   actionId: "rec-1",
 *   actionType: "refactor",
 *   outcome: "accepted",
 *   reason: "Good suggestion"
 * });
 * // Automaticamente registra reward positivo no tracker
 * ```
 */
export class FeedbackCollector {
  private tracker: RewardTracker;
  private config: FeedbackCollectorConfig;
  private events: FeedbackEvent[] = [];

  constructor(tracker: RewardTracker, config?: Partial<FeedbackCollectorConfig>) {
    this.tracker = tracker;
    this.config = {
      sourceWeights: config?.sourceWeights ?? {
        user: 1.0,
        system: 0.8,
        auto: 0.5,
        constitution: 0.9,
      },
      autoRecord: config?.autoRecord ?? true,
    };
  }

  /**
   * Coleta um feedback event.
   */
  collect(event: FeedbackEvent): RewardEntry | null {
    this.events.push(event);

    if (!this.config.autoRecord) return null;

    const reward = this.computeReward(event);
    return this.tracker.record({
      actionId: event.actionId,
      actionType: event.actionType,
      reward,
      reason: event.reason,
      metadata: {
        source: event.source,
        outcome: event.outcome,
        score: event.score,
        ...event.metadata,
      },
    });
  }

  /**
   * Coleta batch de feedback events.
   */
  collectBatch(events: FeedbackEvent[]): Array<RewardEntry | null> {
    return events.map((e) => this.collect(e));
  }

  /**
   * Atalho: user accepted.
   */
  accepted(actionId: string, actionType: string, reason?: string): RewardEntry | null {
    return this.collect({
      source: "user",
      actionId,
      actionType,
      outcome: "accepted",
      reason,
    });
  }

  /**
   * Atalho: user rejected.
   */
  rejected(actionId: string, actionType: string, reason?: string): RewardEntry | null {
    return this.collect({
      source: "user",
      actionId,
      actionType,
      outcome: "rejected",
      reason,
    });
  }

  /**
   * Atalho: constitution score feedback.
   */
  fromConstitution(actionId: string, actionType: string, score: number): RewardEntry | null {
    return this.collect({
      source: "constitution",
      actionId,
      actionType,
      outcome: score >= 70 ? "accepted" : "rejected",
      score,
      reason: `Constitution score: ${score}/100`,
    });
  }

  /** Todos os eventos coletados */
  get allEvents(): ReadonlyArray<FeedbackEvent> {
    return this.events;
  }

  /** Total de eventos */
  get eventCount(): number {
    return this.events.length;
  }

  /**
   * Converte outcome + source em reward (-1 a 1).
   */
  private computeReward(event: FeedbackEvent): number {
    const baseReward = this.outcomeToReward(event.outcome);
    const weight = this.config.sourceWeights[event.source];

    // If we have a score, use it to modulate
    if (event.score !== undefined) {
      const scoreReward = (event.score - 50) / 50; // Map 0-100 to -1 to 1
      return Math.max(-1, Math.min(1, scoreReward * weight));
    }

    return baseReward * weight;
  }

  /**
   * Converte outcome em reward base.
   */
  private outcomeToReward(outcome: FeedbackEvent["outcome"]): number {
    switch (outcome) {
      case "accepted": return 1.0;
      case "rejected": return -1.0;
      case "partial": return 0.3;
      case "timeout": return -0.2;
    }
  }
}
