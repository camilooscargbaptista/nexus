/**
 * @camilooscargbaptista/nexus-bridge — SkillMeta
 *
 * Schema validation (Zod) para SkillDescriptor + fluent builder API.
 * Garante que skills registrados são válidos em runtime.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { z } from "zod";
import type { SkillDescriptor, SkillTrigger, SkillDescriptorCategory } from "./skill-registry.js";
import type { ModelTier } from "@camilooscargbaptista/nexus-core";

// ═══════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════

const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

const DomainSchema = z.enum([
  "web",
  "mobile",
  "backend",
  "data",
  "devops",
  "embedded",
  "fintech",
  "healthtech",
  "ecommerce",
  "saas",
  "general",
]);

const ModelTierSchema = z.enum(["fast", "balanced", "powerful"]);

const CategorySchema = z.enum([
  "security",
  "architecture",
  "performance",
  "testing",
  "devops",
  "database",
  "code-quality",
  "documentation",
  "compliance",
]);

export const SkillTriggerSchema = z.object({
  filePatterns: z.array(z.string()).optional(),
  antiPatterns: z.array(z.string()).optional(),
  scoreBelowThreshold: z.number().min(0).max(100).optional(),
  dimensionThresholds: z.record(z.string(), z.number()).optional(),
  frameworks: z.array(z.string()).optional(),
  domains: z.array(DomainSchema).optional(),
  severityPresent: z.array(SeveritySchema).optional(),
  always: z.boolean().optional(),
});

export const SkillMetaSchema = z.object({
  name: z
    .string()
    .min(1, "Skill name is required")
    .regex(/^[a-z][a-z0-9-]*$/, "Skill name must be kebab-case"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Version must follow semver (e.g. 1.0.0)"),
  category: CategorySchema,
  triggers: SkillTriggerSchema,
  preferredTier: ModelTierSchema,
  minConfidence: z.number().min(0).max(1).default(0.5),
  dependsOn: z.array(z.string()).default([]),
  estimatedTokens: z.number().int().positive().default(3000),
  targetDomains: z.array(DomainSchema).optional(),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),

  // Sprint 2 — Enhanced discovery fields
  /** Glob patterns that auto-activate this skill */
  autoActivatePatterns: z.array(z.string()).optional(),
  /** Domain tags para filtragem */
  domainTags: z.array(z.string()).optional(),
  /** Override do model tier por contexto */
  modelTierOverride: z.record(z.string(), ModelTierSchema).optional(),
});

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** SkillMeta = SkillDescriptor validado + campos extras de discovery */
export type SkillMeta = z.infer<typeof SkillMetaSchema>;

/** Resultado da validação */
export interface SkillMetaValidationResult {
  success: boolean;
  data?: SkillMeta;
  errors?: SkillMetaValidationError[];
}

export interface SkillMetaValidationError {
  field: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Valida um objeto contra o SkillMetaSchema.
 * Retorna resultado tipado com erros detalhados.
 */
export function validateSkillMeta(
  input: unknown,
): SkillMetaValidationResult {
  const result = SkillMetaSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: SkillMetaValidationError[] = result.error.issues.map(
    (issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }),
  );

  return { success: false, errors };
}

/**
 * Valida e retorna o SkillMeta ou joga erro.
 */
export function parseSkillMeta(input: unknown): SkillMeta {
  return SkillMetaSchema.parse(input);
}

// ═══════════════════════════════════════════════════════════════
// BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Fluent builder para construir SkillDescriptor válidos.
 *
 * @example
 * ```ts
 * const meta = SkillMetaBuilder
 *   .create("security-review")
 *   .description("Comprehensive security analysis")
 *   .version("1.0.0")
 *   .category("security")
 *   .triggers({ antiPatterns: ["xss", "sql_injection"] })
 *   .preferredTier("balanced")
 *   .build();
 * ```
 */
export class SkillMetaBuilder {
  private data: Record<string, unknown> = {};

  private constructor(name: string) {
    this.data.name = name;
  }

  /** Inicia um novo builder com o nome da skill */
  static create(name: string): SkillMetaBuilder {
    return new SkillMetaBuilder(name);
  }

  description(desc: string): this {
    this.data.description = desc;
    return this;
  }

  version(v: string): this {
    this.data.version = v;
    return this;
  }

  category(cat: SkillDescriptorCategory): this {
    this.data.category = cat;
    return this;
  }

  triggers(t: SkillTrigger): this {
    this.data.triggers = t;
    return this;
  }

  preferredTier(tier: ModelTier): this {
    this.data.preferredTier = tier;
    return this;
  }

  minConfidence(conf: number): this {
    this.data.minConfidence = conf;
    return this;
  }

  dependsOn(deps: string[]): this {
    this.data.dependsOn = deps;
    return this;
  }

  estimatedTokens(tokens: number): this {
    this.data.estimatedTokens = tokens;
    return this;
  }

  targetDomains(domains: string[]): this {
    this.data.targetDomains = domains;
    return this;
  }

  tags(t: string[]): this {
    this.data.tags = t;
    return this;
  }

  enabled(e: boolean): this {
    this.data.enabled = e;
    return this;
  }

  autoActivatePatterns(patterns: string[]): this {
    this.data.autoActivatePatterns = patterns;
    return this;
  }

  domainTags(dt: string[]): this {
    this.data.domainTags = dt;
    return this;
  }

  /**
   * Valida e retorna o SkillMeta. Joga ZodError se inválido.
   */
  build(): SkillMeta {
    return parseSkillMeta(this.data);
  }

  /**
   * Valida sem jogar erro — retorna resultado tipado.
   */
  tryBuild(): SkillMetaValidationResult {
    return validateSkillMeta(this.data);
  }
}
