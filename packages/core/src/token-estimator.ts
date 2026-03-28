/**
 * @camilooscargbaptista/nexus-core — Token Estimator
 *
 * Estimador de tokens para modelos LLM.
 * Usa heurísticas baseadas em cl100k_base (GPT-4/Claude).
 * Zero dependência — sem tiktoken.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TokenEstimate {
  /** Número estimado de tokens */
  tokens: number;
  /** Caracteres no texto original */
  characters: number;
  /** Ratio tokens/char */
  ratio: number;
  /** Método utilizado */
  method: "heuristic";
}

export interface ModelLimits {
  /** Modelo */
  model: string;
  /** Limite de tokens da context window */
  maxTokens: number;
  /** Tokens reservados para output */
  outputReserve: number;
  /** Tokens disponíveis para input */
  availableInput: number;
}

// ═══════════════════════════════════════════════════════════════
// MODEL LIMITS DATABASE
// ═══════════════════════════════════════════════════════════════

const MODEL_LIMITS: Record<string, { maxTokens: number; outputReserve: number }> = {
  "gpt-4": { maxTokens: 8192, outputReserve: 2048 },
  "gpt-4-turbo": { maxTokens: 128000, outputReserve: 4096 },
  "gpt-4o": { maxTokens: 128000, outputReserve: 4096 },
  "claude-3-haiku": { maxTokens: 200000, outputReserve: 4096 },
  "claude-3-sonnet": { maxTokens: 200000, outputReserve: 4096 },
  "claude-3-opus": { maxTokens: 200000, outputReserve: 4096 },
  "claude-3.5-sonnet": { maxTokens: 200000, outputReserve: 8192 },
  "claude-4-sonnet": { maxTokens: 200000, outputReserve: 8192 },
  "gemini-pro": { maxTokens: 1000000, outputReserve: 8192 },
  "gemini-2.5-pro": { maxTokens: 1000000, outputReserve: 65536 },
};

// ═══════════════════════════════════════════════════════════════
// TOKEN ESTIMATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Estimador de tokens zero-dependência.
 *
 * Heurística: ~4 chars ≈ 1 token (cl100k_base).
 * Ajustes para code (mais tokens/char) e plain text.
 *
 * @example
 * ```ts
 * const estimate = TokenEstimator.estimate("Hello, world!");
 * // estimate.tokens ≈ 4
 *
 * const limits = TokenEstimator.getModelLimits("claude-3.5-sonnet");
 * // limits.availableInput === 191808
 * ```
 */
export class TokenEstimator {
  /** Chars por token — heurística base */
  private static readonly CHARS_PER_TOKEN = 4;

  /** Ajuste para código (mais tokens por char) */
  private static readonly CODE_MULTIPLIER = 1.3;

  /**
   * Estima tokens de um texto.
   */
  static estimate(text: string, isCode: boolean = false): TokenEstimate {
    const characters = text.length;
    const multiplier = isCode ? this.CODE_MULTIPLIER : 1.0;
    const tokens = Math.ceil((characters / this.CHARS_PER_TOKEN) * multiplier);

    return {
      tokens,
      characters,
      ratio: characters > 0 ? Math.round((tokens / characters) * 100) / 100 : 0,
      method: "heuristic",
    };
  }

  /**
   * Estima tokens de múltiplos textos.
   */
  static estimateMany(texts: string[], isCode: boolean = false): TokenEstimate {
    const combined = texts.join("\n");
    return this.estimate(combined, isCode);
  }

  /**
   * Retorna limites de um modelo.
   */
  static getModelLimits(model: string): ModelLimits {
    const limits = MODEL_LIMITS[model] ?? { maxTokens: 8192, outputReserve: 2048 };

    return {
      model,
      maxTokens: limits.maxTokens,
      outputReserve: limits.outputReserve,
      availableInput: limits.maxTokens - limits.outputReserve,
    };
  }

  /**
   * Verifica se um texto cabe na context window de um modelo.
   */
  static fits(text: string, model: string, isCode: boolean = false): { fits: boolean; tokens: number; available: number; overflow: number } {
    const estimate = this.estimate(text, isCode);
    const limits = this.getModelLimits(model);

    return {
      fits: estimate.tokens <= limits.availableInput,
      tokens: estimate.tokens,
      available: limits.availableInput,
      overflow: Math.max(0, estimate.tokens - limits.availableInput),
    };
  }

  /**
   * Retorna modelos disponíveis.
   */
  static get availableModels(): string[] {
    return Object.keys(MODEL_LIMITS);
  }
}
