/**
 * @camilooscargbaptista/nexus-bridge — Spec Generator
 *
 * Gerador de tech specs completos a partir de uma descrição textual.
 * Combina SpecParser + SpecTemplate para produzir documentação
 * nível C4 automaticamente.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { SpecParser } from "./spec-parser.js";
import type { ParsedSpec } from "./spec-parser.js";
import { SpecTemplate } from "./spec-template.js";
import type { TemplateType, TemplateSection } from "./spec-template.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SpecGeneratorConfig {
  /** Template type override */
  templateType?: TemplateType;
  /** Nome do projeto (override auto-detected) */
  projectName?: string;
  /** Adicionar seções extras */
  extraSections?: Array<{ title: string; content: string }>;
}

export interface GeneratedSpec {
  /** Spec parseada */
  parsed: ParsedSpec;
  /** Seções geradas */
  sections: TemplateSection[];
  /** Markdown completo */
  markdown: string;
  /** Metadata */
  metadata: {
    generatedAt: string;
    templateType: TemplateType;
    sectionCount: number;
    confidence: number;
    wordCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// SPEC GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Gera tech specs completos a partir de descrição textual.
 *
 * @example
 * ```ts
 * const generator = new SpecGenerator();
 *
 * const spec = generator.generate(
 *   "Sistema de negociação de dívidas multi-channel com WhatsApp, " +
 *   "Telegram e SMS. Agentes de onboarding, transação e compliance. " +
 *   "Python + FastAPI + Kafka + PostgreSQL. Deploy em Kubernetes na AWS."
 * );
 *
 * console.log(spec.markdown);
 * // → Tech spec completo com 10+ seções, C4 diagram, data model, API, deploy
 * ```
 */
export class SpecGenerator {
  private config: SpecGeneratorConfig;

  constructor(config?: SpecGeneratorConfig) {
    this.config = config ?? {};
  }

  /**
   * Gera spec completa a partir de descrição textual.
   */
  generate(input: string): GeneratedSpec {
    // 1. Parse input
    const parsed = SpecParser.parse(input);

    // 2. Determine template type
    const templateType = this.config.templateType ?? this.inferTemplateType(parsed);

    // 3. Project name
    const projectName = this.config.projectName ?? parsed.title;

    // 4. Generate sections
    const sections = SpecTemplate.generate({
      projectName,
      templateType,
      actors: parsed.actors,
      features: parsed.features.map((f) => f.name),
      entities: parsed.entities,
      techStack: parsed.techStack,
      integrations: parsed.integrations,
      nfrs: parsed.nonFunctionalRequirements,
    });

    // 5. Add extra sections
    if (this.config.extraSections) {
      for (const extra of this.config.extraSections) {
        sections.push({
          title: extra.title,
          content: `## ${extra.title}\n\n${extra.content}`,
          level: 2,
        });
      }
    }

    // 6. Render markdown
    const markdown = SpecTemplate.render({
      projectName,
      templateType,
      actors: parsed.actors,
      features: parsed.features.map((f) => f.name),
      entities: parsed.entities,
      techStack: parsed.techStack,
      integrations: parsed.integrations,
      nfrs: parsed.nonFunctionalRequirements,
    });

    return {
      parsed,
      sections,
      markdown,
      metadata: {
        generatedAt: new Date().toISOString(),
        templateType,
        sectionCount: sections.length,
        confidence: parsed.confidence,
        wordCount: markdown.split(/\s+/).length,
      },
    };
  }

  /**
   * Gera spec simplificada (apenas seções críticas).
   */
  generateLite(input: string): string {
    const spec = this.generate(input);
    const criticalSections = spec.sections.filter((s) =>
      ["Overview", "Features", "Architecture", "Data Model", "Tech Stack"].includes(s.title)
    );
    return criticalSections.map((s) => s.content).join("\n\n---\n\n");
  }

  /**
   * Infere o template type a partir do parsed spec.
   */
  private inferTemplateType(parsed: ParsedSpec): TemplateType {
    if (parsed.techStack.includes("Flutter")) return "mobile";
    if (parsed.techStack.includes("React") && parsed.techStack.some((t) =>
      ["TypeScript", "Python"].includes(t))) return "full-stack";
    if (parsed.techStack.includes("Kafka") || parsed.integrations.length > 2) return "microservice";
    if (parsed.entities.length > 5) return "monolith";
    return "full-stack";
  }
}
