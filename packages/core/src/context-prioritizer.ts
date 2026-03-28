/**
 * @camilooscargbaptista/nexus-core — Context Prioritizer
 *
 * Prioriza e seleciona chunks de contexto para caber
 * na context window de um modelo LLM.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { TokenEstimator } from "./token-estimator.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ContextChunk {
  /** ID único */
  id: string;
  /** Conteúdo textual */
  content: string;
  /** Prioridade (1 = mais importante) */
  priority: number;
  /** Tipo do chunk */
  type: "system" | "history" | "document" | "tool-result" | "user";
  /** Se é código-fonte */
  isCode?: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface ContextWindow {
  /** Chunks selecionados (em ordem de inserção) */
  selected: ContextChunk[];
  /** Chunks descartados por falta de espaço */
  dropped: ContextChunk[];
  /** Tokens usados */
  tokensUsed: number;
  /** Tokens disponíveis */
  tokensAvailable: number;
  /** Porcentagem de uso */
  usagePercent: number;
}

export interface ContextPrioritizerConfig {
  /** Modelo alvo */
  model: string;
  /** Reserva extra de tokens (além do output reserve) — default 500 */
  safetyMargin: number;
  /** Prioridades fixas por tipo (override) */
  typePriorities?: Partial<Record<ContextChunk["type"], number>>;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT PRIORITIZER
// ═══════════════════════════════════════════════════════════════

/**
 * Seleciona e prioriza chunks de contexto para caber
 * no budget de tokens de um modelo.
 *
 * @example
 * ```ts
 * const prioritizer = new ContextPrioritizer({ model: "claude-3.5-sonnet" });
 *
 * const window = prioritizer.build([
 *   { id: "sys", content: "You are Nexus...", priority: 1, type: "system" },
 *   { id: "doc1", content: bigDocument, priority: 3, type: "document" },
 *   { id: "q", content: "user query", priority: 2, type: "user" },
 * ]);
 *
 * // window.selected — chunks que cabem
 * // window.dropped — chunks que não cabem
 * ```
 */
export class ContextPrioritizer {
  private config: ContextPrioritizerConfig;

  constructor(config: Partial<ContextPrioritizerConfig> & { model: string }) {
    this.config = {
      model: config.model,
      safetyMargin: config.safetyMargin ?? 500,
      typePriorities: config.typePriorities,
    };
  }

  /**
   * Constrói a context window selecionando chunks por prioridade.
   */
  build(chunks: ContextChunk[]): ContextWindow {
    const limits = TokenEstimator.getModelLimits(this.config.model);
    const budget = limits.availableInput - this.config.safetyMargin;

    // Sort by priority (1 = highest) then by type priority
    const sorted = [...chunks].sort((a, b) => {
      const aPri = this.effectivePriority(a);
      const bPri = this.effectivePriority(b);
      return aPri - bPri;
    });

    const selected: ContextChunk[] = [];
    const dropped: ContextChunk[] = [];
    let tokensUsed = 0;

    for (const chunk of sorted) {
      const estimate = TokenEstimator.estimate(chunk.content, chunk.isCode);

      if (tokensUsed + estimate.tokens <= budget) {
        selected.push(chunk);
        tokensUsed += estimate.tokens;
      } else {
        dropped.push(chunk);
      }
    }

    return {
      selected,
      dropped,
      tokensUsed,
      tokensAvailable: budget,
      usagePercent: budget > 0 ? Math.round((tokensUsed / budget) * 100) : 0,
    };
  }

  /**
   * Verifica quanto budget resta para tokens.
   */
  remainingBudget(usedTokens: number): number {
    const limits = TokenEstimator.getModelLimits(this.config.model);
    return limits.availableInput - this.config.safetyMargin - usedTokens;
  }

  /**
   * Calcula prioridade efetiva (considerando type overrides).
   */
  private effectivePriority(chunk: ContextChunk): number {
    const typeOverride = this.config.typePriorities?.[chunk.type];
    if (typeOverride !== undefined) return typeOverride;
    return chunk.priority;
  }
}
