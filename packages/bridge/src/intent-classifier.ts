/**
 * @nexus/bridge — Intent Classifier
 *
 * Classifica queries em categorias de intent usando pattern matching
 * e opcionalmente LLM para queries ambíguas.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type IntentCategory =
  | "architecture"
  | "security"
  | "performance"
  | "quality"
  | "devops"
  | "testing"
  | "documentation"
  | "refactoring"
  | "debugging"
  | "unknown";

export interface ClassificationResult {
  /** Categoria primária */
  primary: IntentCategory;
  /** Score de confiança (0-1) */
  confidence: number;
  /** Categorias secundárias (e.g., "security + performance") */
  secondary: IntentCategory[];
  /** Método usado: "pattern" ou "llm" */
  method: "pattern" | "llm";
  /** Keywords que triggaram a classificação */
  matchedKeywords: string[];
}

export interface ClassifierConfig {
  /** Score mínimo para considerar match — default 0.3 */
  minConfidence: number;
  /** Função LLM para fallback em queries ambíguas */
  llmFallback?: (query: string) => Promise<IntentCategory>;
}

// ═══════════════════════════════════════════════════════════════
// KEYWORD MAPS
// ═══════════════════════════════════════════════════════════════

interface CategoryKeywords {
  category: IntentCategory;
  keywords: string[];
  weight: number;
}

const CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    category: "architecture",
    keywords: ["architecture", "design pattern", "solid", "clean code", "dependency", "coupling", "cohesion", "module", "layer", "component", "monolith", "microservice", "c4", "diagram", "structure"],
    weight: 1.0,
  },
  {
    category: "security",
    keywords: ["security", "vulnerability", "xss", "csrf", "injection", "auth", "authentication", "authorization", "jwt", "oauth", "rbac", "encrypt", "credentials", "secret", "owasp", "pentest", "attack"],
    weight: 1.2,
  },
  {
    category: "performance",
    keywords: ["performance", "slow", "fast", "latency", "throughput", "bottleneck", "cache", "memory", "cpu", "optimize", "profiling", "benchmark", "p99", "response time", "load"],
    weight: 1.0,
  },
  {
    category: "quality",
    keywords: ["quality", "code review", "lint", "smell", "technical debt", "maintainability", "readability", "complexity", "coverage", "standards", "best practice"],
    weight: 0.9,
  },
  {
    category: "devops",
    keywords: ["deploy", "docker", "kubernetes", "ci/cd", "pipeline", "infrastructure", "aws", "cloud", "terraform", "monitoring", "alerting", "scaling", "container"],
    weight: 1.0,
  },
  {
    category: "testing",
    keywords: ["test", "unit test", "integration test", "e2e", "tdd", "bdd", "mock", "stub", "coverage", "jest", "cypress", "playwright", "qa"],
    weight: 0.9,
  },
  {
    category: "documentation",
    keywords: ["document", "api doc", "swagger", "openapi", "readme", "spec", "rfc", "wiki", "jsdoc", "comment"],
    weight: 0.7,
  },
  {
    category: "refactoring",
    keywords: ["refactor", "restructure", "reorganize", "rewrite", "extract", "inline", "rename", "decompose", "simplify", "consolidate", "migrate"],
    weight: 1.0,
  },
  {
    category: "debugging",
    keywords: ["debug", "bug", "error", "fix", "broken", "crash", "exception", "stack trace", "root cause", "investigate", "failing", "flaky"],
    weight: 1.1,
  },
];

// ═══════════════════════════════════════════════════════════════
// INTENT CLASSIFIER
// ═══════════════════════════════════════════════════════════════

/**
 * Classificador de intenção baseado em keywords + LLM fallback.
 *
 * @example
 * ```ts
 * const classifier = new IntentClassifier();
 * const result = classifier.classify("fix the XSS vulnerability in the login page");
 * // result.primary === "security"
 * // result.confidence === 0.8
 * ```
 */
export class IntentClassifier {
  private config: ClassifierConfig;

  constructor(config?: Partial<ClassifierConfig>) {
    this.config = {
      minConfidence: config?.minConfidence ?? 0.3,
      llmFallback: config?.llmFallback,
    };
  }

  /**
   * Classifica uma query em categorias de intent.
   */
  async classify(query: string): Promise<ClassificationResult> {
    const patternResult = this.classifyByPattern(query);

    // If pattern match is confident enough, return it
    if (patternResult.confidence >= this.config.minConfidence) {
      return patternResult;
    }

    // Try LLM fallback if available
    if (this.config.llmFallback) {
      try {
        const llmCategory = await this.config.llmFallback(query);
        return {
          primary: llmCategory,
          confidence: 0.7, // LLM default confidence
          secondary: patternResult.secondary,
          method: "llm",
          matchedKeywords: [],
        };
      } catch {
        // LLM failed, return pattern result
      }
    }

    return patternResult;
  }

  /**
   * Classificação síncrona (pattern-only, sem LLM).
   */
  classifySync(query: string): ClassificationResult {
    return this.classifyByPattern(query);
  }

  /**
   * Classificação interna por pattern matching.
   */
  private classifyByPattern(query: string): ClassificationResult {
    const lower = query.toLowerCase();
    const scores = new Map<IntentCategory, { score: number; keywords: string[] }>();

    for (const cat of CATEGORY_KEYWORDS) {
      const matched: string[] = [];
      for (const keyword of cat.keywords) {
        if (lower.includes(keyword)) {
          matched.push(keyword);
        }
      }

      if (matched.length > 0) {
        const score = (matched.length / cat.keywords.length) * cat.weight;
        scores.set(cat.category, { score, keywords: matched });
      }
    }

    if (scores.size === 0) {
      return {
        primary: "unknown",
        confidence: 0,
        secondary: [],
        method: "pattern",
        matchedKeywords: [],
      };
    }

    // Sort by score descending
    const sorted = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);

    const [primary, primaryData] = sorted[0]!;
    const secondary = sorted.slice(1, 3).map(([cat]) => cat);

    // Normalize confidence
    const maxPossibleScore = Math.max(...CATEGORY_KEYWORDS.map((c) => c.weight));
    const confidence = Math.min(1, primaryData.score / (maxPossibleScore * 0.3));

    return {
      primary,
      confidence: Math.round(confidence * 100) / 100,
      secondary,
      method: "pattern",
      matchedKeywords: primaryData.keywords,
    };
  }
}
