/**
 * @camilooscargbaptista/nexus-core — Context Window Manager
 *
 * Gerencia a janela de contexto completa para prompts LLM.
 * Combina TokenEstimator + ContextPrioritizer + prompt assembly.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { TokenEstimator } from "./token-estimator.js";
import { ContextPrioritizer } from "./context-prioritizer.js";
import type { ContextChunk, ContextWindow } from "./context-prioritizer.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ContextManagerConfig {
  /** Modelo alvo */
  model: string;
  /** System prompt base */
  systemPrompt: string;
  /** Safety margin — default 500 */
  safetyMargin: number;
}

export interface AssembledPrompt {
  /** System prompt */
  system: string;
  /** Mensagens de contexto (history + documents) */
  contextMessages: string[];
  /** User query */
  userQuery: string;
  /** Tokens usados no total */
  totalTokens: number;
  /** Chunks descartados */
  droppedChunks: string[];
  /** Uso da context window (%) */
  usagePercent: number;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT WINDOW MANAGER
// ═══════════════════════════════════════════════════════════════

/**
 * Gerencia a context window completa para um prompt LLM.
 *
 * @example
 * ```ts
 * const manager = new ContextWindowManager({
 *   model: "claude-3.5-sonnet",
 *   systemPrompt: "You are Nexus, an AI architect.",
 * });
 *
 * manager.addDocument("doc1", "Architecture overview...", 2);
 * manager.addHistory("Previous analysis...");
 *
 * const prompt = manager.assemble("Analyze the auth module");
 * // prompt.system, prompt.contextMessages, prompt.userQuery
 * ```
 */
export class ContextWindowManager {
  private config: ContextManagerConfig;
  private prioritizer: ContextPrioritizer;
  private chunks: ContextChunk[] = [];
  private nextId = 0;

  constructor(config: Partial<ContextManagerConfig> & { model: string }) {
    this.config = {
      model: config.model,
      systemPrompt: config.systemPrompt ?? "",
      safetyMargin: config.safetyMargin ?? 500,
    };

    this.prioritizer = new ContextPrioritizer({
      model: this.config.model,
      safetyMargin: this.config.safetyMargin,
    });
  }

  /**
   * Adiciona documento ao contexto.
   */
  addDocument(id: string, content: string, priority: number = 5): void {
    this.chunks.push({
      id,
      content,
      priority,
      type: "document",
      isCode: this.looksLikeCode(content),
    });
  }

  /**
   * Adiciona código-fonte ao contexto.
   */
  addCode(id: string, content: string, priority: number = 3): void {
    this.chunks.push({ id, content, priority, type: "document", isCode: true });
  }

  /**
   * Adiciona histórico de conversa.
   */
  addHistory(content: string, priority: number = 7): void {
    this.chunks.push({
      id: `history-${++this.nextId}`,
      content,
      priority,
      type: "history",
    });
  }

  /**
   * Adiciona resultado de tool call.
   */
  addToolResult(id: string, content: string, priority: number = 4): void {
    this.chunks.push({ id, content, priority, type: "tool-result" });
  }

  /**
   * Monta o prompt completo otimizado para o budget do modelo.
   */
  assemble(userQuery: string): AssembledPrompt {
    // System prompt always included (highest priority)
    const systemChunk: ContextChunk = {
      id: "system",
      content: this.config.systemPrompt,
      priority: 0,
      type: "system",
    };

    // User query always included
    const userChunk: ContextChunk = {
      id: "user-query",
      content: userQuery,
      priority: 1,
      type: "user",
    };

    const allChunks = [systemChunk, userChunk, ...this.chunks];
    const window = this.prioritizer.build(allChunks);

    const contextMessages = window.selected
      .filter((c) => c.type !== "system" && c.type !== "user")
      .map((c) => c.content);

    return {
      system: this.config.systemPrompt,
      contextMessages,
      userQuery,
      totalTokens: window.tokensUsed,
      droppedChunks: window.dropped.map((c) => c.id),
      usagePercent: window.usagePercent,
    };
  }

  /**
   * Limpa todos os chunks de contexto.
   */
  clear(): void {
    this.chunks = [];
  }

  /**
   * Retorna status atual da janela.
   */
  getStatus(): { chunkCount: number; model: string; estimatedTokens: number } {
    const totalContent = this.chunks.map((c) => c.content).join("\n");
    const estimate = TokenEstimator.estimate(totalContent);

    return {
      chunkCount: this.chunks.length,
      model: this.config.model,
      estimatedTokens: estimate.tokens,
    };
  }

  /** Número de chunks registrados */
  get chunkCount(): number {
    return this.chunks.length;
  }

  /**
   * Heurística: parece código?
   */
  private looksLikeCode(content: string): boolean {
    const codeIndicators = [
      /\bfunction\b/,
      /\bconst\b/,
      /\bclass\b/,
      /\bimport\b/,
      /\breturn\b/,
      /[{}();]/,
      /=>/,
    ];

    const matches = codeIndicators.filter((re) => re.test(content)).length;
    return matches >= 3;
  }
}
