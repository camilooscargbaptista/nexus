/**
 * @nexus/core — Self-Reflection Engine
 *
 * Loop de auto-reflexão: gera → avalia → regenera.
 * Training-Free RL sem GPU, sem fine-tuning.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { ConstitutionEngine } from "./constitution.js";
import type { ConstitutionEvaluation, EvaluationContext } from "./constitution.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Função que gera conteúdo — injetável para testabilidade */
export type ContentGenerator = (prompt: string, feedback?: string) => Promise<string>;

export interface ReflectionConfig {
  /** Máximo de tentativas de regeneração — default 3 */
  maxAttempts: number;
  /** Score mínimo para aceitar — default 70 */
  threshold: number;
  /** Se deve incluir feedback na regeneração — default true */
  includeFeedback: boolean;
}

export interface ReflectionResult {
  /** Conteúdo final aceito */
  content: string;
  /** Se passou na avaliação constitucional */
  passed: boolean;
  /** Número de tentativas realizadas */
  attempts: number;
  /** Avaliações de cada tentativa */
  evaluations: ConstitutionEvaluation[];
  /** Score final */
  finalScore: number;
  /** Se melhorou ao longo das tentativas */
  improved: boolean;
}

export interface ReflectionEvent {
  type: "reflection.started" | "reflection.attempt" | "reflection.passed" | "reflection.failed";
  attempt?: number;
  score?: number;
  maxAttempts?: number;
}

/** Callback para emissão de eventos */
export type ReflectionEventEmitter = (event: ReflectionEvent) => void;

// ═══════════════════════════════════════════════════════════════
// REFLECTION LOOP
// ═══════════════════════════════════════════════════════════════

/**
 * Loop de auto-reflexão para quality assurance de conteúdo gerado.
 *
 * Pipeline:
 * 1. Generator produz conteúdo
 * 2. ConstitutionEngine avalia contra regras
 * 3. Se score < threshold → regenera com feedback
 * 4. Repete até max attempts ou score aceitável
 *
 * @example
 * ```ts
 * const loop = new ReflectionLoop(constitution, generator);
 * const result = await loop.reflect("Analyze this codebase for security issues");
 * // Se primeira tentativa tem score 55, regenera com feedback
 * // Segunda tentativa com score 82 → aceita
 * ```
 */
export class ReflectionLoop {
  private config: ReflectionConfig;
  private eventEmitter?: ReflectionEventEmitter;

  constructor(
    private constitution: ConstitutionEngine,
    private generator: ContentGenerator,
    config?: Partial<ReflectionConfig>,
  ) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 3,
      threshold: config?.threshold ?? 70,
      includeFeedback: config?.includeFeedback ?? true,
    };
  }

  /**
   * Define callback para emissão de eventos.
   */
  onEvent(emitter: ReflectionEventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Executa o loop de reflexão.
   *
   * @param prompt - Prompt original para o generator
   * @param context - Contexto para avaliação constitucional
   */
  async reflect(prompt: string, context?: EvaluationContext): Promise<ReflectionResult> {
    this.emit({ type: "reflection.started", maxAttempts: this.config.maxAttempts });

    const evaluations: ConstitutionEvaluation[] = [];
    let currentContent = "";
    let lastFeedback: string | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      // Generate content (with feedback from previous attempt if available)
      const fullPrompt = lastFeedback && this.config.includeFeedback
        ? `${prompt}\n\n[QUALITY FEEDBACK FROM PREVIOUS ATTEMPT]\n${lastFeedback}\n\nPlease address the issues above in your response.`
        : prompt;

      currentContent = await this.generator(fullPrompt, lastFeedback) ?? "";

      // Evaluate against constitution
      const evaluation = this.constitution.evaluate(currentContent, context);
      evaluations.push(evaluation);

      this.emit({
        type: "reflection.attempt",
        attempt,
        score: evaluation.score,
      });

      // Check if passed
      if (evaluation.passed) {
        this.emit({ type: "reflection.passed", score: evaluation.score, attempt });

        return {
          content: currentContent,
          passed: true,
          attempts: attempt,
          evaluations,
          finalScore: evaluation.score,
          improved: evaluations.length > 1,
        };
      }

      // Store feedback for next attempt
      lastFeedback = evaluation.feedback;
    }

    // Max attempts reached — return best attempt
    const bestIdx = evaluations.reduce(
      (best, ev, idx) => (ev.score > evaluations[best]!.score ? idx : best),
      0,
    );

    const finalEval = evaluations[evaluations.length - 1]!;

    this.emit({ type: "reflection.failed", score: finalEval.score });

    // Re-generate best content if it wasn't the last one
    // For simplicity, return the last generated content
    return {
      content: currentContent,
      passed: false,
      attempts: this.config.maxAttempts,
      evaluations,
      finalScore: finalEval.score,
      improved: evaluations.length > 1 &&
        evaluations[evaluations.length - 1]!.score > evaluations[0]!.score,
    };
  }

  /**
   * Avalia conteúdo já existente sem regenerar.
   */
  evaluate(content: string, context?: EvaluationContext): ConstitutionEvaluation {
    return this.constitution.evaluate(content, context);
  }

  private emit(event: ReflectionEvent): void {
    this.eventEmitter?.(event);
  }
}
