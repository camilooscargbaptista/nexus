/**
 * @camilooscargbaptista/nexus-bridge — LLM Recommender
 *
 * Recomendação inteligente de skills: BM25 primeiro, fallback para LLM
 * quando o score de confiança é insuficiente.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { SkillSearchEngine } from "./bm25-search.js";
import type { SkillSearchResult } from "./bm25-search.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Interface abstrata para provider LLM — injetável e mockável */
export interface LLMProvider {
  /** Envia prompt e retorna resposta textual */
  complete(prompt: string): Promise<string>;
}

export interface SkillRecommendation {
  skillName: string;
  score: number;
  source: "bm25" | "llm" | "merged";
  reasoning?: string;
}

export interface RecommenderConfig {
  /** Score mínimo do BM25 para aceitar sem fallback LLM — default 1.5 */
  bm25Threshold: number;
  /** Máximo de resultados — default 5 */
  topK: number;
  /** Se deve usar LLM como fallback — default true */
  useLLMFallback: boolean;
}

// ═══════════════════════════════════════════════════════════════
// LLM RECOMMENDER
// ═══════════════════════════════════════════════════════════════

/**
 * Recomendador de skills com BM25 + LLM fallback.
 *
 * Fluxo:
 * 1. Busca via BM25 (rápido, local)
 * 2. Se top result score < threshold → consulta LLM
 * 3. Merge: BM25 results + LLM suggestions (dedup por nome)
 *
 * @example
 * ```ts
 * const recommender = new LLMRecommender(llmProvider);
 * recommender.indexSkills(skills);
 * const recs = await recommender.recommend("analyze security vulnerabilities");
 * ```
 */
export class LLMRecommender {
  private searchEngine = new SkillSearchEngine();
  private skillNames: string[] = [];
  private config: RecommenderConfig;

  constructor(
    private llmProvider?: LLMProvider,
    config: Partial<RecommenderConfig> = {},
  ) {
    this.config = {
      bm25Threshold: config.bm25Threshold ?? 1.5,
      topK: config.topK ?? 5,
      useLLMFallback: config.useLLMFallback ?? true,
    };
  }

  /**
   * Indexa skills para busca.
   */
  indexSkills(
    skills: Array<{
      name: string;
      description: string;
      tags?: string[];
      category?: string;
    }>,
  ): void {
    this.searchEngine.indexSkills(skills);
    this.skillNames = skills.map((s) => s.name);
  }

  /**
   * Recomenda skills para uma query.
   *
   * Pipeline: BM25 → (threshold check) → LLM fallback → merge → dedup
   */
  async recommend(query: string): Promise<SkillRecommendation[]> {
    // Step 1: BM25 search
    const bm25Results = this.searchEngine.search(query, this.config.topK);

    const bm25Recs: SkillRecommendation[] = bm25Results.map((r) => ({
      skillName: r.skillName,
      score: r.score,
      source: "bm25" as const,
    }));

    // Step 2: Check if BM25 is sufficient
    const topScore = bm25Recs[0]?.score ?? 0;
    const needsFallback =
      this.config.useLLMFallback &&
      this.llmProvider &&
      topScore < this.config.bm25Threshold;

    if (!needsFallback) {
      return bm25Recs.slice(0, this.config.topK);
    }

    // Step 3: LLM fallback
    const llmRecs = await this.queryLLM(query);

    // Step 4: Merge (BM25 + LLM, dedup by name)
    return this.mergeResults(bm25Recs, llmRecs);
  }

  /**
   * Consulta o LLM para sugestões de skills.
   */
  private async queryLLM(query: string): Promise<SkillRecommendation[]> {
    if (!this.llmProvider) return [];

    const prompt = this.buildPrompt(query);

    try {
      const response = await this.llmProvider.complete(prompt);
      return this.parseResponse(response);
    } catch {
      // LLM fallback failure — return empty (BM25 results still available)
      return [];
    }
  }

  /**
   * Constrói o prompt para o LLM.
   */
  private buildPrompt(query: string): string {
    return [
      "You are a skill recommendation engine. Given a user query, select the most relevant skills from the available list.",
      "",
      `Available skills: ${this.skillNames.join(", ")}`,
      "",
      `User query: "${query}"`,
      "",
      "Respond with a JSON array of objects with 'name' and 'reasoning' fields. Select up to 3 skills.",
      'Example: [{"name": "security-review", "reasoning": "Query mentions vulnerability analysis"}]',
    ].join("\n");
  }

  /**
   * Parseia a resposta do LLM em SkillRecommendation[].
   */
  private parseResponse(response: string): SkillRecommendation[] {
    try {
      // Extrai JSON da resposta (pode ter texto antes/depois)
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        name: string;
        reasoning?: string;
      }>;

      return parsed
        .filter((item) => this.skillNames.includes(item.name))
        .map((item, idx) => ({
          skillName: item.name,
          score: 2.0 - idx * 0.3, // Synthetic score, descending
          source: "llm" as const,
          reasoning: item.reasoning,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Merge BM25 + LLM results, dedup por skillName.
   * LLM results ganham boost se também aparecem no BM25.
   */
  private mergeResults(
    bm25: SkillRecommendation[],
    llm: SkillRecommendation[],
  ): SkillRecommendation[] {
    const merged = new Map<string, SkillRecommendation>();

    // Add BM25 results
    for (const rec of bm25) {
      merged.set(rec.skillName, rec);
    }

    // Merge LLM results
    for (const rec of llm) {
      const existing = merged.get(rec.skillName);
      if (existing) {
        // Boost: aparece em ambos
        merged.set(rec.skillName, {
          skillName: rec.skillName,
          score: existing.score + rec.score * 0.5,
          source: "merged",
          reasoning: rec.reasoning,
        });
      } else {
        merged.set(rec.skillName, rec);
      }
    }

    // Sort by score, return top K
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.topK);
  }

  /** Número de skills indexadas */
  get skillCount(): number {
    return this.searchEngine.size;
  }
}
