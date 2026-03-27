/**
 * @nexus/bridge — BM25 Search Engine
 *
 * Implementação zero-dependency do algoritmo BM25 (Best Matching 25)
 * para busca textual semântica de skills no Nexus.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BM25Config {
  /** Term frequency saturation — default 1.2 */
  k1: number;
  /** Document length normalization — default 0.75 */
  b: number;
}

export interface SearchResult {
  id: string;
  score: number;
  document: string;
}

interface IndexedDocument {
  id: string;
  text: string;
  tokens: string[];
  termFrequency: Map<string, number>;
  length: number;
}

// ═══════════════════════════════════════════════════════════════
// STOPWORDS (English)
// ═══════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to",
  "for", "of", "with", "by", "is", "it", "be", "as", "do", "has",
  "had", "was", "are", "not", "no", "this", "that", "from", "will",
  "can", "so", "if", "than", "its", "may", "all", "into", "then",
  "each", "any", "such", "also", "more", "been", "should", "would",
  "could", "which", "when", "where", "what", "who", "how", "up",
  "out", "about", "their", "them", "they", "we", "you", "your",
  "our", "my", "me", "he", "she", "him", "her",
]);

// ═══════════════════════════════════════════════════════════════
// TOKENIZER
// ═══════════════════════════════════════════════════════════════

/**
 * Tokeniza texto: lowercase, remove pontuação, split, remove stopwords.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// ═══════════════════════════════════════════════════════════════
// BM25 INDEX
// ═══════════════════════════════════════════════════════════════

/**
 * Motor de busca BM25 in-memory.
 *
 * @example
 * ```ts
 * const index = new BM25Index();
 * index.addDocument("doc1", "security vulnerability analysis");
 * index.addDocument("doc2", "performance optimization profiling");
 * index.buildIndex();
 * const results = index.search("security audit", 5);
 * ```
 */
export class BM25Index {
  private documents: Map<string, IndexedDocument> = new Map();
  private idf: Map<string, number> = new Map();
  private averageDocLength = 0;
  private built = false;
  private config: BM25Config;

  constructor(config: Partial<BM25Config> = {}) {
    this.config = {
      k1: config.k1 ?? 1.2,
      b: config.b ?? 0.75,
    };
  }

  /**
   * Adiciona um documento ao corpus.
   */
  addDocument(id: string, text: string): void {
    const tokens = tokenize(text);
    const termFrequency = new Map<string, number>();

    for (const token of tokens) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }

    this.documents.set(id, {
      id,
      text,
      tokens,
      termFrequency,
      length: tokens.length,
    });

    // Invalidate index on new document
    this.built = false;
  }

  /**
   * Remove um documento do corpus.
   */
  removeDocument(id: string): boolean {
    const removed = this.documents.delete(id);
    if (removed) this.built = false;
    return removed;
  }

  /**
   * Constrói o índice (calcula IDF e average doc length).
   * Deve ser chamado após adicionar todos os documentos.
   */
  buildIndex(): void {
    const N = this.documents.size;
    if (N === 0) {
      this.built = true;
      return;
    }

    // Average document length
    let totalLength = 0;
    for (const doc of this.documents.values()) {
      totalLength += doc.length;
    }
    this.averageDocLength = totalLength / N;

    // IDF: log((N - n + 0.5) / (n + 0.5) + 1)
    const allTerms = new Set<string>();
    for (const doc of this.documents.values()) {
      for (const term of doc.termFrequency.keys()) {
        allTerms.add(term);
      }
    }

    for (const term of allTerms) {
      let docFrequency = 0;
      for (const doc of this.documents.values()) {
        if (doc.termFrequency.has(term)) docFrequency++;
      }

      const idf = Math.log(
        (N - docFrequency + 0.5) / (docFrequency + 0.5) + 1,
      );
      this.idf.set(term, idf);
    }

    this.built = true;
  }

  /**
   * Busca documentos por query, retorna top K resultados ordenados por score.
   */
  search(query: string, topK = 10): SearchResult[] {
    if (!this.built) this.buildIndex();
    if (this.documents.size === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      let score = 0;

      for (const term of queryTokens) {
        const tf = doc.termFrequency.get(term) ?? 0;
        const idf = this.idf.get(term) ?? 0;

        if (tf === 0 || idf === 0) continue;

        // BM25 formula
        const numerator = tf * (this.config.k1 + 1);
        const denominator =
          tf +
          this.config.k1 *
            (1 -
              this.config.b +
              this.config.b * (doc.length / this.averageDocLength));

        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({ id: doc.id, score, document: doc.text });
      }
    }

    // Sort descending by score
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK);
  }

  /** Número de documentos no corpus */
  get size(): number {
    return this.documents.size;
  }

  /** Se o índice foi construído */
  get isBuilt(): boolean {
    return this.built;
  }
}

// ═══════════════════════════════════════════════════════════════
// SKILL SEARCH ENGINE
// ═══════════════════════════════════════════════════════════════

export interface SkillSearchResult {
  skillName: string;
  score: number;
  description: string;
}

/**
 * Wrapper do BM25Index para buscar SkillDescriptors por query.
 *
 * Indexa nome, descrição, tags e categoria de cada skill para
 * matching semântico.
 */
export class SkillSearchEngine {
  private index = new BM25Index();

  /**
   * Indexa uma lista de skills.
   */
  indexSkills(
    skills: Array<{
      name: string;
      description: string;
      tags?: string[];
      category?: string;
    }>,
  ): void {
    for (const skill of skills) {
      const searchableText = [
        skill.name.replace(/-/g, " "),
        skill.description,
        ...(skill.tags ?? []),
        skill.category ?? "",
      ].join(" ");

      this.index.addDocument(skill.name, searchableText);
    }

    this.index.buildIndex();
  }

  /**
   * Busca skills por query textual.
   */
  search(query: string, topK = 5): SkillSearchResult[] {
    return this.index.search(query, topK).map((r) => ({
      skillName: r.id,
      score: r.score,
      description: r.document,
    }));
  }

  /** Número de skills indexadas */
  get size(): number {
    return this.index.size;
  }
}
