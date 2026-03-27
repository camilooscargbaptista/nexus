/**
 * @nexus/bridge — Critic Adapter
 *
 * Adapter que converte o SentinelAdapter em um "critic" automático
 * para o ReflectionLoop. Avalia recomendações do pipeline usando
 * regras de qualidade do Sentinel.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { ConstitutionEngine } from "@nexus/core";
import type {
  ConstitutionRule,
  ConstitutionEvaluation,
  EvaluationContext,
} from "@nexus/core";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CriticConfig {
  /** Threshold para aprovação — default 70 */
  threshold: number;
  /** Regras customizadas adicionais */
  additionalRules?: ConstitutionRule[];
  /** Se deve incluir regras de código — default true */
  includeCodeRules: boolean;
}

export interface CriticVerdict {
  /** Se o conteúdo foi aprovado */
  approved: boolean;
  /** Score de qualidade (0-100) */
  qualityScore: number;
  /** Avaliação completa */
  evaluation: ConstitutionEvaluation;
  /** Sugestões de melhoria */
  suggestions: string[];
}

// ═══════════════════════════════════════════════════════════════
// CODE-SPECIFIC RULES
// ═══════════════════════════════════════════════════════════════

/** Verifica se recomendação de código tem exemplos */
function evaluateCodeExamples(content: string): number {
  const hasCodeBlock = /```[\s\S]*?```/.test(content);
  const hasInlineCode = /`[^`]+`/.test(content);
  const hasBefore = /before|existing|current/i.test(content);
  const hasAfter = /after|updated|improved|refactored/i.test(content);

  let score = 0;
  if (hasCodeBlock) score += 40;
  if (hasInlineCode) score += 20;
  if (hasBefore && hasAfter) score += 40;
  else if (hasBefore || hasAfter) score += 20;

  return Math.min(100, score);
}

/** Verifica se contém assessment de impacto */
function evaluateImpactAssessment(content: string): number {
  const lower = content.toLowerCase();
  const impactPatterns = [
    /\bimpact\b/, /\brisk\b/, /\bbreaking\b/, /\bcritical\b/,
    /\bperformance\b/, /\bsecurity\b/, /\bscalability\b/,
    /\bcost\b/, /\blatency\b/, /\bavailability\b/,
    /\bbenefit\b/, /\btrade-?off\b/, /\bpro[s]?\b.*\bcon[s]?\b/,
  ];

  const matches = impactPatterns.filter((p) => p.test(lower)).length;
  return Math.min(100, (matches / 3) * 100);
}

/** Verifica especificidade — nomes de arquivos, funções, linhas */
function evaluateSpecificity(content: string): number {
  const hasFilePaths = /[a-zA-Z_-]+\.(ts|js|py|java|go|rs|tsx|jsx)/.test(content);
  const hasFunctionNames = /`\w+\(`/.test(content) || /function\s+\w+/.test(content);
  const hasLineNumbers = /line\s*\d+/i.test(content) || /L\d+/.test(content);
  const hasMetrics = /\d+%|\d+ms|\d+\.\d+s/.test(content);

  let score = 0;
  if (hasFilePaths) score += 30;
  if (hasFunctionNames) score += 30;
  if (hasLineNumbers) score += 20;
  if (hasMetrics) score += 20;

  return score;
}

const CODE_RULES: ConstitutionRule[] = [
  {
    id: "code-examples",
    description: "Recommendations should include code examples when applicable",
    category: "actionability",
    weight: 1.0,
    evaluate: evaluateCodeExamples,
  },
  {
    id: "impact-assessment",
    description: "Recommendations should include impact and risk assessment",
    category: "completeness",
    weight: 0.9,
    evaluate: evaluateImpactAssessment,
  },
  {
    id: "specificity",
    description: "Recommendations should reference specific files, functions, or metrics",
    category: "accuracy",
    weight: 1.1,
    evaluate: evaluateSpecificity,
  },
];

// ═══════════════════════════════════════════════════════════════
// CRITIC ADAPTER
// ═══════════════════════════════════════════════════════════════

/**
 * Critic que avalia recomendações do Nexus pipeline.
 *
 * Combina ConstitutionEngine (regras gerais) + code-specific rules
 * para dar um veredicto de qualidade com sugestões.
 *
 * @example
 * ```ts
 * const critic = new CriticAdapter();
 * const verdict = critic.judge("Refactor the auth module");
 * // verdict.approved === false
 * // verdict.suggestions === ["Add code examples", "Include impact assessment"]
 * ```
 */
export class CriticAdapter {
  private engine: ConstitutionEngine;
  private config: CriticConfig;

  constructor(config?: Partial<CriticConfig>) {
    this.config = {
      threshold: config?.threshold ?? 70,
      includeCodeRules: config?.includeCodeRules ?? true,
      additionalRules: config?.additionalRules,
    };

    this.engine = new ConstitutionEngine({ threshold: this.config.threshold });

    // Add code-specific rules
    if (this.config.includeCodeRules) {
      for (const rule of CODE_RULES) {
        this.engine.addRule(rule);
      }
    }

    // Add custom rules
    if (this.config.additionalRules) {
      for (const rule of this.config.additionalRules) {
        this.engine.addRule(rule);
      }
    }
  }

  /**
   * Avalia e julga uma recomendação.
   */
  judge(content: string, context?: EvaluationContext): CriticVerdict {
    const evaluation = this.engine.evaluate(content, context);

    const suggestions = this.generateSuggestions(evaluation);

    return {
      approved: evaluation.passed,
      qualityScore: evaluation.score,
      evaluation,
      suggestions,
    };
  }

  /**
   * Avaliação rápida — só retorna score.
   */
  quickScore(content: string): number {
    return this.engine.evaluate(content).score;
  }

  /**
   * Gera sugestões concretas baseadas nas violações.
   */
  private generateSuggestions(evaluation: ConstitutionEvaluation): string[] {
    const suggestions: string[] = [];

    for (const violation of evaluation.violations) {
      switch (violation.ruleId) {
        case "completeness":
          suggestions.push("Add more detail and substance to the recommendation");
          break;
        case "actionability":
          suggestions.push("Include concrete, actionable steps (use verbs: refactor, create, replace)");
          break;
        case "security-safe":
          suggestions.push("Review for security anti-patterns — avoid suggesting insecure practices");
          break;
        case "professional-tone":
          suggestions.push("Maintain professional tone throughout");
          break;
        case "accuracy":
          suggestions.push("Remove hedging language and unverified claims");
          break;
        case "code-examples":
          suggestions.push("Add code examples showing before/after");
          break;
        case "impact-assessment":
          suggestions.push("Include impact analysis: risk, performance, security implications");
          break;
        case "specificity":
          suggestions.push("Reference specific files, function names, or metrics");
          break;
        default:
          suggestions.push(`Address: ${violation.ruleId}`);
      }
    }

    return suggestions;
  }
}
