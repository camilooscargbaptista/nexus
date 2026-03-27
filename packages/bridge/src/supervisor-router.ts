/**
 * @nexus/bridge — Supervisor Router
 *
 * Orquestrador inteligente que substitui ToolkitRouter hardcoded.
 * Combina IntentClassifier + BM25 + RoutingStrategy para decidir
 * qual skill ativar.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { IntentClassifier } from "./intent-classifier.js";
import { RoutingStrategy } from "./routing-strategy.js";
import type { ClassificationResult, ClassifierConfig } from "./intent-classifier.js";
import type { ActivationPlan, RoutingStrategyConfig, IntentSkillMap } from "./routing-strategy.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SupervisorConfig {
  /** Config do classifier */
  classifier?: Partial<ClassifierConfig>;
  /** Config da strategy */
  strategy?: Partial<RoutingStrategyConfig>;
  /** Mapeamento custom intent → skills */
  intentMap?: Partial<IntentSkillMap>;
  /** Função BM25 externa para busca de skills */
  searchFn?: (query: string) => Array<{ id: string; name: string; score: number }>;
}

export interface SupervisorDecision {
  /** Query original */
  query: string;
  /** Plano de ativação */
  plan: ActivationPlan;
  /** Intent classification */
  classification: ClassificationResult;
  /** Tempo de decisão (ms) */
  decisionTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════
// SUPERVISOR ROUTER
// ═══════════════════════════════════════════════════════════════

/**
 * Router inteligente estilo Supervisor Agent (SmartCollect pattern).
 *
 * Pipeline:
 * 1. IntentClassifier classifica a query
 * 2. BM25 busca skills por similaridade textual (se searchFn)
 * 3. RoutingStrategy combina ambos em ActivationPlan
 *
 * @example
 * ```ts
 * const supervisor = new SupervisorRouter({
 *   searchFn: (q) => bm25Index.search(q).map(r => ({ id: r.id, name: r.name, score: r.score }))
 * });
 *
 * const decision = await supervisor.decide("fix XSS vulnerability in login");
 * // decision.plan.skills = [{ skillId: "security-review", score: 0.9 }]
 * ```
 */
export class SupervisorRouter {
  private classifier: IntentClassifier;
  private strategy: RoutingStrategy;
  private searchFn?: SupervisorConfig["searchFn"];

  constructor(config?: SupervisorConfig) {
    this.classifier = new IntentClassifier(config?.classifier);
    this.strategy = new RoutingStrategy(config?.strategy, config?.intentMap);
    this.searchFn = config?.searchFn;
  }

  /**
   * Decide quais skills ativar para uma query.
   */
  async decide(query: string): Promise<SupervisorDecision> {
    const start = Date.now();

    // Step 1: Classify intent
    const classification = await this.classifier.classify(query);

    // Step 2: BM25 search (if available)
    const bm25Results = this.searchFn ? this.searchFn(query) : [];

    // Step 3: Route
    const plan = this.strategy.route(classification, bm25Results);

    return {
      query,
      plan,
      classification,
      decisionTimeMs: Date.now() - start,
    };
  }

  /**
   * Decisão síncrona (sem LLM fallback).
   */
  decideSync(query: string): SupervisorDecision {
    const start = Date.now();

    const classification = this.classifier.classifySync(query);
    const bm25Results = this.searchFn ? this.searchFn(query) : [];
    const plan = this.strategy.route(classification, bm25Results);

    return {
      query,
      plan,
      classification,
      decisionTimeMs: Date.now() - start,
    };
  }
}
