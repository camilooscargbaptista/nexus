/**
 * @camilooscargbaptista/nexus-core — Constitution Engine
 *
 * Define regras de qualidade (constitutions) contra as quais
 * o ReflectionLoop avalia recomendações antes de emitir.
 *
 * Inspirado em Constitutional AI (Anthropic) e Training-Free RL
 * do SmartCollect Phoenix.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConstitutionRule {
  /** Identificador único da regra */
  id: string;
  /** Descrição legível */
  description: string;
  /** Categoria: accuracy, security, actionability, tone */
  category: ConstitutionCategory;
  /** Peso no score final (0-1) — default 1.0 */
  weight: number;
  /** Função de avaliação: retorna score 0-100 */
  evaluate: (content: string, context?: EvaluationContext) => number;
}

export type ConstitutionCategory =
  | "accuracy"
  | "security"
  | "actionability"
  | "tone"
  | "completeness"
  | "custom";

export interface EvaluationContext {
  /** Tipo do conteúdo: recommendation, analysis, report */
  contentType?: string;
  /** Metadata adicional */
  metadata?: Record<string, unknown>;
}

export interface ConstitutionEvaluation {
  /** Score final ponderado (0-100) */
  score: number;
  /** Se passou no threshold */
  passed: boolean;
  /** Resultados por regra */
  ruleResults: RuleResult[];
  /** Regras que falharam (score < 50) */
  violations: RuleResult[];
  /** Feedback consolidado para regeneração */
  feedback: string;
}

export interface RuleResult {
  ruleId: string;
  category: ConstitutionCategory;
  score: number;
  weight: number;
  weightedScore: number;
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN RULES
// ═══════════════════════════════════════════════════════════════

/** Verifica se o conteúdo tem substância mínima */
function evaluateCompleteness(content: string): number {
  const words = content.split(/\s+/).length;
  if (words < 10) return 10;
  if (words < 30) return 40;
  if (words < 50) return 60;
  if (words < 100) return 80;
  return 100;
}

/** Verifica se o conteúdo contém ações concretas */
function evaluateActionability(content: string): number {
  const lower = content.toLowerCase();
  const actionPatterns = [
    /\bshould\b/, /\bmust\b/, /\brecommend\b/, /\bimplement\b/,
    /\brefactor\b/, /\bcreate\b/, /\bremove\b/, /\badd\b/,
    /\breplace\b/, /\bfix\b/, /\bupdate\b/, /\bmigrate\b/,
    /\buse\b/, /\bavoid\b/, /\bconsider\b/, /\b→\b/,
  ];

  const matches = actionPatterns.filter((p) => p.test(lower)).length;
  return Math.min(100, (matches / 4) * 100);
}

/** Verifica se o conteúdo não contém patterns de segurança perigosos */
function evaluateSecurity(content: string): number {
  const lower = content.toLowerCase();
  const dangerPatterns = [
    /hardcoded\s+(password|secret|key|token)/,
    /disable\s+(auth|security|ssl|tls|csrf)/,
    /\beval\s*\(/,
    /process\.env\.\w+\s*(?:=|:)\s*["'][^"']+["']/,
    /trust\s+all\s+cert/i,
  ];

  const violations = dangerPatterns.filter((p) => p.test(lower)).length;
  return violations === 0 ? 100 : Math.max(0, 100 - violations * 30);
}

/** Verifica se o conteúdo tem tom profissional */
function evaluateTone(content: string): number {
  const lower = content.toLowerCase();
  const unprofessional = [
    /\blol\b/, /\bromfl\b/, /\bwtf\b/, /\bimho\b/,
    /\bstupid\b/, /\bidiot\b/, /\bdumb\b/, /\bsucks?\b/,
    /\bhack(y|ish)?\b/, /!!{3,}/,
  ];

  const violations = unprofessional.filter((p) => p.test(lower)).length;
  return violations === 0 ? 100 : Math.max(0, 100 - violations * 25);
}

/** Verifica se há indicadores de hallucination */
function evaluateAccuracy(content: string): number {
  const lower = content.toLowerCase();
  const hallucination = [
    /\bas of my training\b/, /\bi don't have access\b/,
    /\bi cannot verify\b/, /\bi believe\b.*\bprobably\b/,
    /\bversion \d+\.\d+\.\d+\b.*\breleased\b/,
  ];

  const hedging = [
    /\bpossibly\b/, /\bperhaps\b/, /\bmaybe\b/,
    /\bmight be\b/, /\bcould be\b/,
  ];

  const hallMatches = hallucination.filter((p) => p.test(lower)).length;
  const hedgeMatches = hedging.filter((p) => p.test(lower)).length;

  let score = 100;
  score -= hallMatches * 30;
  score -= hedgeMatches * 10;
  return Math.max(0, score);
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONSTITUTION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RULES: ConstitutionRule[] = [
  {
    id: "completeness",
    description: "Content must have sufficient substance and detail",
    category: "completeness",
    weight: 1.0,
    evaluate: evaluateCompleteness,
  },
  {
    id: "actionability",
    description: "Recommendations must include concrete, actionable steps",
    category: "actionability",
    weight: 1.2,
    evaluate: evaluateActionability,
  },
  {
    id: "security-safe",
    description: "Content must not suggest insecure practices",
    category: "security",
    weight: 1.5,
    evaluate: evaluateSecurity,
  },
  {
    id: "professional-tone",
    description: "Content must maintain professional tone",
    category: "tone",
    weight: 0.8,
    evaluate: evaluateTone,
  },
  {
    id: "accuracy",
    description: "Content must not contain hallucination indicators",
    category: "accuracy",
    weight: 1.3,
    evaluate: evaluateAccuracy,
  },
];

// ═══════════════════════════════════════════════════════════════
// CONSTITUTION ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Motor de avaliação constitucional.
 *
 * Avalia conteúdo contra um conjunto de regras ponderadas e retorna
 * score + feedback para o ReflectionLoop.
 *
 * @example
 * ```ts
 * const engine = new ConstitutionEngine();
 * const eval = engine.evaluate("Use eval() to parse user input");
 * // eval.score < 70, eval.violations contém "security-safe"
 * ```
 */
export class ConstitutionEngine {
  private rules: ConstitutionRule[];
  private threshold: number;

  constructor(config?: { rules?: ConstitutionRule[]; threshold?: number }) {
    this.rules = config?.rules ?? [...DEFAULT_RULES];
    this.threshold = config?.threshold ?? 70;
  }

  /**
   * Avalia conteúdo contra todas as regras.
   */
  evaluate(content: string, context?: EvaluationContext): ConstitutionEvaluation {
    const ruleResults: RuleResult[] = this.rules.map((rule) => {
      const score = rule.evaluate(content, context);
      return {
        ruleId: rule.id,
        category: rule.category,
        score,
        weight: rule.weight,
        weightedScore: score * rule.weight,
      };
    });

    const totalWeight = ruleResults.reduce((sum, r) => sum + r.weight, 0);
    const weightedSum = ruleResults.reduce((sum, r) => sum + r.weightedScore, 0);
    const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    const violations = ruleResults.filter((r) => r.score < 50);
    const passed = finalScore >= this.threshold && violations.length === 0;

    const feedback = this.generateFeedback(violations, ruleResults);

    return { score: finalScore, passed, ruleResults, violations, feedback };
  }

  /**
   * Adiciona uma regra customizada.
   */
  addRule(rule: ConstitutionRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove uma regra por ID.
   */
  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  /** Número de regras ativas */
  get ruleCount(): number {
    return this.rules.length;
  }

  /** Threshold atual */
  get passThreshold(): number {
    return this.threshold;
  }

  /**
   * Gera feedback consolidado baseado nas violações.
   */
  private generateFeedback(violations: RuleResult[], all: RuleResult[]): string {
    if (violations.length === 0) {
      return "Content meets all quality standards.";
    }

    const lines = violations.map((v) => {
      const rule = this.rules.find((r) => r.id === v.ruleId);
      return `- [${v.category.toUpperCase()}] ${rule?.description ?? v.ruleId} (score: ${v.score}/100)`;
    });

    const weakest = [...all]
      .sort((a, b) => a.score - b.score)
      .slice(0, 2)
      .map((r) => r.ruleId);

    return [
      "Quality violations detected. Please address:",
      ...lines,
      "",
      `Focus on improving: ${weakest.join(", ")}`,
    ].join("\n");
  }
}
