/**
 * @camilooscargbaptista/nexus-bridge — Routing Strategy
 *
 * Estratégia híbrida de roteamento: BM25 fast-match + IntentClassifier
 * para queries ambíguas. Determina qual(is) skill(s) devem ser ativadas.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { IntentCategory, ClassificationResult } from "./intent-classifier.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SkillCandidate {
  /** ID do skill */
  skillId: string;
  /** Nome do skill */
  name: string;
  /** Score de Match (0-1) */
  score: number;
  /** Método que encontrou: "bm25" | "intent" | "hybrid" */
  source: "bm25" | "intent" | "hybrid";
}

export interface ActivationPlan {
  /** Skills selecionados para ativação, ordenados por relevância */
  skills: SkillCandidate[];
  /** Classificação de intent */
  intent: ClassificationResult;
  /** Confiança geral do plano (0-1) */
  confidence: number;
  /** Estratégia usada */
  strategy: "fast-match" | "intent-classify" | "hybrid-merge";
}

export interface RoutingStrategyConfig {
  /** Score mínimo do BM25 para fast-match — default 0.5 */
  bm25Threshold: number;
  /** Máximo de skills no plano — default 3 */
  maxSkills: number;
  /** Se deve combinar BM25 + intent quando ambos têm match — default true */
  enableHybrid: boolean;
}

/** Mapeamento de intent → skill IDs */
export type IntentSkillMap = Record<IntentCategory, string[]>;

// ═══════════════════════════════════════════════════════════════
// DEFAULT INTENT → SKILL MAPPING
// ═══════════════════════════════════════════════════════════════

const DEFAULT_INTENT_MAP: IntentSkillMap = {
  architecture: ["design-patterns", "adr", "tech-spec"],
  security: ["security-review", "pentest"],
  performance: ["performance-profiling", "cost-optimization"],
  quality: ["code-review", "quality-standard"],
  devops: ["devops-infra", "terraform-iac"],
  testing: ["testing-strategy"],
  documentation: ["api-documentation", "tech-spec"],
  refactoring: ["design-patterns", "code-review"],
  debugging: ["systematic-debugging"],
  unknown: [],
};

// ═══════════════════════════════════════════════════════════════
// ROUTING STRATEGY
// ═══════════════════════════════════════════════════════════════

/**
 * Estratégia de roteamento que combina resultados BM25 + intent classification
 * para determinar skills a ativar.
 *
 * @example
 * ```ts
 * const strategy = new RoutingStrategy();
 * const plan = strategy.route(intentResult, bm25Results);
 * // plan.skills === [{ skillId: "security-review", score: 0.9, source: "hybrid" }]
 * ```
 */
export class RoutingStrategy {
  private config: RoutingStrategyConfig;
  private intentMap: IntentSkillMap;

  constructor(config?: Partial<RoutingStrategyConfig>, intentMap?: Partial<IntentSkillMap>) {
    this.config = {
      bm25Threshold: config?.bm25Threshold ?? 0.5,
      maxSkills: config?.maxSkills ?? 3,
      enableHybrid: config?.enableHybrid ?? true,
    };
    this.intentMap = { ...DEFAULT_INTENT_MAP, ...intentMap };
  }

  /**
   * Determina activation plan baseado em intent + BM25.
   */
  route(
    intent: ClassificationResult,
    bm25Results?: Array<{ id: string; name: string; score: number }>,
  ): ActivationPlan {
    const bm25Candidates = this.fromBM25(bm25Results ?? []);
    const intentCandidates = this.fromIntent(intent);

    const hasBM25 = bm25Candidates.length > 0 && bm25Candidates[0]!.score >= this.config.bm25Threshold;
    const hasIntent = intentCandidates.length > 0 && intent.confidence > 0.3;

    // Strategy decision
    if (hasBM25 && hasIntent && this.config.enableHybrid) {
      return this.hybridMerge(bm25Candidates, intentCandidates, intent);
    }

    if (hasBM25) {
      return {
        skills: bm25Candidates.slice(0, this.config.maxSkills),
        intent,
        confidence: bm25Candidates[0]!.score,
        strategy: "fast-match",
      };
    }

    if (hasIntent) {
      return {
        skills: intentCandidates.slice(0, this.config.maxSkills),
        intent,
        confidence: intent.confidence * 0.8,
        strategy: "intent-classify",
      };
    }

    // No match
    return {
      skills: [],
      intent,
      confidence: 0,
      strategy: "fast-match",
    };
  }

  /**
   * Merge BM25 + Intent results usando reciprocal rank fusion.
   */
  private hybridMerge(
    bm25: SkillCandidate[],
    intent: SkillCandidate[],
    classification: ClassificationResult,
  ): ActivationPlan {
    const merged = new Map<string, SkillCandidate>();

    // Add BM25 results
    for (let i = 0; i < bm25.length; i++) {
      const candidate = bm25[i]!;
      merged.set(candidate.skillId, {
        ...candidate,
        score: candidate.score * 0.6 + (1 / (i + 1)) * 0.4, // RRF-like
        source: "hybrid",
      });
    }

    // Boost or add intent results
    for (let i = 0; i < intent.length; i++) {
      const candidate = intent[i]!;
      const existing = merged.get(candidate.skillId);

      if (existing) {
        existing.score = Math.min(1, existing.score + candidate.score * 0.3); // Boost
      } else {
        merged.set(candidate.skillId, {
          ...candidate,
          score: candidate.score * 0.5,
          source: "intent",
        });
      }
    }

    const sortedSkills = [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxSkills);

    return {
      skills: sortedSkills,
      intent: classification,
      confidence: sortedSkills[0]?.score ?? 0,
      strategy: "hybrid-merge",
    };
  }

  /**
   * Converte BM25 results em SkillCandidates.
   */
  private fromBM25(results: Array<{ id: string; name: string; score: number }>): SkillCandidate[] {
    return results.map((r) => ({
      skillId: r.id,
      name: r.name,
      score: r.score,
      source: "bm25" as const,
    }));
  }

  /**
   * Converte intent em SkillCandidates.
   */
  private fromIntent(intent: ClassificationResult): SkillCandidate[] {
    const skillIds = this.intentMap[intent.primary] ?? [];
    const candidates: SkillCandidate[] = skillIds.map((id, idx) => ({
      skillId: id,
      name: id,
      score: intent.confidence * (1 - idx * 0.15), // Decay by position
      source: "intent" as const,
    }));

    // Add secondary intent skills
    for (const secondary of intent.secondary) {
      const secIds = this.intentMap[secondary] ?? [];
      for (const id of secIds) {
        if (!candidates.some((c) => c.skillId === id)) {
          candidates.push({
            skillId: id,
            name: id,
            score: intent.confidence * 0.4,
            source: "intent",
          });
        }
      }
    }

    return candidates;
  }
}
