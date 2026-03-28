/**
 * @camilooscargbaptista/nexus-core — Memory System
 *
 * Port do memory.py para TypeScript.
 * ShortTermMemory (FIFO), LongTermMemory (cosine similarity), HybridMemory.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { LLMProvider, EmbeddingResponse } from "./llm-provider.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MemoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingEntry {
  content: string;
  embedding: number[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  add(entry: MemoryEntry): void;
  retrieve(query?: string, topK?: number): MemoryEntry[];
  clear(): void;
  size(): number;
}

// ═══════════════════════════════════════════════════════════════
// SHORT-TERM MEMORY (FIFO)
// ═══════════════════════════════════════════════════════════════

export class ShortTermMemory implements MemoryStore {
  private entries: MemoryEntry[] = [];
  private readonly maxTurns: number;

  constructor(maxTurns = 10) {
    this.maxTurns = maxTurns;
  }

  add(entry: MemoryEntry): void {
    this.entries.push(entry);
    // Each turn = 2 entries (user + assistant)
    while (this.entries.length > this.maxTurns * 2) {
      this.entries.shift();
    }
  }

  addMessage(role: MemoryEntry["role"], content: string, metadata?: Record<string, unknown>): void {
    this.add({
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  retrieve(_query?: string, topK = 5): MemoryEntry[] {
    return this.entries.slice(-topK);
  }

  /**
   * Retorna as últimas N turns como contexto de conversa.
   */
  getContext(numTurns = 5): Array<{ role: string; content: string }> {
    const entries = this.entries.slice(-(numTurns * 2));
    return entries.map((e) => ({ role: e.role, content: e.content }));
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }

  get all(): MemoryEntry[] {
    return [...this.entries];
  }
}

// ═══════════════════════════════════════════════════════════════
// LONG-TERM MEMORY (Vector Similarity)
// ═══════════════════════════════════════════════════════════════

export class LongTermMemory {
  private entries: EmbeddingEntry[] = [];
  private provider?: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Armazena conteúdo com embedding pré-calculado.
   */
  add(content: string, embedding: number[], metadata?: Record<string, unknown>): void {
    this.entries.push({
      content,
      embedding,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Gera embedding via LLMProvider e armazena.
   */
  async store(content: string, metadata?: Record<string, unknown>): Promise<number[]> {
    const embedding = await this.generateEmbedding(content);
    this.add(content, embedding, metadata);
    return embedding;
  }

  /**
   * Busca semântica: retorna os top_k conteúdos mais similares.
   */
  async retrieve(query: string, topK = 5): Promise<string[]> {
    const results = await this.search(query, topK);
    return results.map(([content]) => content);
  }

  /**
   * Busca com scores: retorna (content, similarity).
   */
  async search(query: string, topK = 5): Promise<Array<[string, number]>> {
    if (this.entries.length === 0) return [];

    const queryEmbedding = await this.generateEmbedding(query);

    const scored = this.entries.map((entry) => ({
      content: entry.content,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map((s) => [s.content, s.score]);
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.provider) {
      const response = await this.provider.embed(text);
      return response.embedding;
    }

    // Fallback: hash-based embedding (determinístico mas não semântico)
    return hashEmbedding(text);
  }
}

// ═══════════════════════════════════════════════════════════════
// HYBRID MEMORY
// ═══════════════════════════════════════════════════════════════

export class HybridMemory {
  readonly shortTerm: ShortTermMemory;
  readonly longTerm: LongTermMemory;

  constructor(maxTurns = 10, provider?: LLMProvider) {
    this.shortTerm = new ShortTermMemory(maxTurns);
    this.longTerm = new LongTermMemory(provider);
  }

  /**
   * Adiciona uma interação à memória de curto prazo.
   * Se persist=true, também armazena na memória de longo prazo.
   */
  async addInteraction(
    role: MemoryEntry["role"],
    content: string,
    persist = false,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.shortTerm.addMessage(role, content, metadata);
    if (persist) {
      await this.longTerm.store(content, { role, ...metadata });
    }
  }

  /**
   * Retorna contexto de conversa recente.
   */
  getContext(numTurns = 5): Array<{ role: string; content: string }> {
    return this.shortTerm.getContext(numTurns);
  }

  /**
   * Busca na memória de longo prazo.
   */
  async searchKnowledge(query: string, topK = 5): Promise<string[]> {
    return this.longTerm.retrieve(query, topK);
  }

  clear(): void {
    this.shortTerm.clear();
    this.longTerm.clear();
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Cosine similarity entre dois vetores.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Hash-based embedding (placeholder — determinístico mas não semântico).
 */
function hashEmbedding(text: string, dims = 384): number[] {
  // Simple hash-based approach for when no LLM provider is available
  const embedding: number[] = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const idx = (i * 7 + charCode * 13) % dims;
    embedding[idx] = ((embedding[idx]! + charCode / 255) % 2) - 1;
  }

  // Normalize
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += embedding[i]! * embedding[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dims; i++) embedding[i] = embedding[i]! / norm;
  }

  return embedding;
}
