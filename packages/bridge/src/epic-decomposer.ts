/**
 * @nexus/bridge — Epic Decomposer
 *
 * Decompõe features/specs em Epics estruturados.
 * Input: ParsedSpec → Output: lista de Epics com dependências.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { ParsedSpec, ParsedFeature } from "./spec-parser.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Epic {
  /** ID único */
  id: string;
  /** Título */
  title: string;
  /** Descrição */
  description: string;
  /** Categoria */
  category: EpicCategory;
  /** Prioridade (1 = mais alta) */
  priority: number;
  /** Story points estimados */
  estimatedPoints: number;
  /** Features associadas */
  features: string[];
  /** Dependências (IDs de outros Epics) */
  dependsOn: string[];
}

export type EpicCategory =
  | "infrastructure"
  | "data-model"
  | "backend"
  | "frontend"
  | "integration"
  | "security"
  | "observability"
  | "testing"
  | "deployment";

// ═══════════════════════════════════════════════════════════════
// EPIC CATEGORY RULES
// ═══════════════════════════════════════════════════════════════

/** Ordem natural de epics — infraestrutura primeiro, deploy por último */
const CATEGORY_PRIORITY: Record<EpicCategory, number> = {
  "infrastructure": 1,
  "data-model": 2,
  "backend": 3,
  "integration": 4,
  "frontend": 5,
  "security": 6,
  "observability": 7,
  "testing": 8,
  "deployment": 9,
};

const CATEGORY_POINTS: Record<EpicCategory, number> = {
  "infrastructure": 8,
  "data-model": 5,
  "backend": 13,
  "integration": 8,
  "frontend": 13,
  "security": 5,
  "observability": 5,
  "testing": 8,
  "deployment": 5,
};

// ═══════════════════════════════════════════════════════════════
// EPIC DECOMPOSER
// ═══════════════════════════════════════════════════════════════

/**
 * Decompõe um ParsedSpec em Epics ordenados por dependência.
 *
 * @example
 * ```ts
 * const parsed = SpecParser.parse("Sistema com PostgreSQL + Kafka...");
 * const epics = EpicDecomposer.decompose(parsed);
 * // → Epics: Infrastructure → Data Model → Backend → Integration → ...
 * ```
 */
export class EpicDecomposer {
  /**
   * Decompõe spec em epics.
   */
  static decompose(spec: ParsedSpec): Epic[] {
    const epics: Epic[] = [];
    let nextId = 0;

    const makeId = (): string => `epic-${++nextId}`;

    // 1. Infrastructure (always first)
    if (spec.techStack.length > 0) {
      epics.push({
        id: makeId(),
        title: "Project Setup & Infrastructure",
        description: `Initialize project with ${spec.techStack.join(", ")}. Configure CI/CD, Docker, linting, testing framework.`,
        category: "infrastructure",
        priority: CATEGORY_PRIORITY["infrastructure"],
        estimatedPoints: CATEGORY_POINTS["infrastructure"],
        features: [],
        dependsOn: [],
      });
    }

    // 2. Data Model
    if (spec.entities.length > 0) {
      epics.push({
        id: makeId(),
        title: "Data Model & Database Schema",
        description: `Design and implement database schema for: ${spec.entities.join(", ")}. Create migrations and seed data.`,
        category: "data-model",
        priority: CATEGORY_PRIORITY["data-model"],
        estimatedPoints: CATEGORY_POINTS["data-model"] + spec.entities.length * 2,
        features: [],
        dependsOn: [epics[0]?.id ?? ""],
      });
    }

    // 3. Backend — one per feature cluster
    const featureChunks = this.chunkFeatures(spec.features, 3);
    for (const chunk of featureChunks) {
      const names = chunk.map((f) => f.name).join(", ");
      epics.push({
        id: makeId(),
        title: `Backend: ${names}`,
        description: `Implement backend logic, services, and API endpoints for: ${names}.`,
        category: "backend",
        priority: CATEGORY_PRIORITY["backend"],
        estimatedPoints: chunk.reduce((sum, f) => sum + f.complexity * 3, 0) + 5,
        features: chunk.map((f) => f.name),
        dependsOn: epics.filter((e) => e.category === "data-model").map((e) => e.id),
      });
    }

    // 4. Integrations
    if (spec.integrations.length > 0) {
      epics.push({
        id: makeId(),
        title: `External Integrations: ${spec.integrations.join(", ")}`,
        description: `Implement integrations with: ${spec.integrations.join(", ")}. Configure webhooks, API clients, and error handling.`,
        category: "integration",
        priority: CATEGORY_PRIORITY["integration"],
        estimatedPoints: CATEGORY_POINTS["integration"] + spec.integrations.length * 3,
        features: [],
        dependsOn: epics.filter((e) => e.category === "backend").map((e) => e.id),
      });
    }

    // 5. Frontend
    if (spec.actors.some((a) => ["user", "admin", "driver"].includes(a))) {
      const frontendActors = spec.actors.filter((a) => ["user", "admin", "driver"].includes(a));
      epics.push({
        id: makeId(),
        title: `Frontend: ${frontendActors.join(", ")} interfaces`,
        description: `Build UI for ${frontendActors.join(", ")} personas. Responsive, accessible, with state management.`,
        category: "frontend",
        priority: CATEGORY_PRIORITY["frontend"],
        estimatedPoints: CATEGORY_POINTS["frontend"],
        features: [],
        dependsOn: epics.filter((e) => e.category === "backend").map((e) => e.id),
      });
    }

    // 6. Security
    if (spec.nonFunctionalRequirements.some((nfr) => nfr.includes("Security"))) {
      epics.push({
        id: makeId(),
        title: "Security & Compliance",
        description: "Implement authentication, authorization, data encryption, LGPD compliance, input validation.",
        category: "security",
        priority: CATEGORY_PRIORITY["security"],
        estimatedPoints: CATEGORY_POINTS["security"],
        features: [],
        dependsOn: epics.filter((e) => e.category === "backend").map((e) => e.id),
      });
    }

    // 7. Observability
    if (spec.nonFunctionalRequirements.some((nfr) => nfr.includes("Observability")) || spec.techStack.length > 3) {
      epics.push({
        id: makeId(),
        title: "Observability & Monitoring",
        description: "Configure structured logging, metrics, distributed tracing, health checks, alerting.",
        category: "observability",
        priority: CATEGORY_PRIORITY["observability"],
        estimatedPoints: CATEGORY_POINTS["observability"],
        features: [],
        dependsOn: epics.filter((e) => e.category === "backend").map((e) => e.id),
      });
    }

    // 8. Testing
    epics.push({
      id: makeId(),
      title: "Test Suite & Quality Gates",
      description: "Implement unit tests, integration tests, E2E tests. Configure coverage thresholds and quality gates.",
      category: "testing",
      priority: CATEGORY_PRIORITY["testing"],
      estimatedPoints: CATEGORY_POINTS["testing"],
      features: [],
      dependsOn: epics.filter((e) => ["backend", "frontend"].includes(e.category)).map((e) => e.id),
    });

    // 9. Deployment
    epics.push({
      id: makeId(),
      title: "Deployment & CI/CD",
      description: "Configure production deployment, CI/CD pipelines, environment management, rollback strategy.",
      category: "deployment",
      priority: CATEGORY_PRIORITY["deployment"],
      estimatedPoints: CATEGORY_POINTS["deployment"],
      features: [],
      dependsOn: [epics[epics.length - 1]?.id ?? ""],
    });

    return epics.sort((a, b) => a.priority - b.priority);
  }

  /** Agrupa features em chunks */
  private static chunkFeatures(features: ParsedFeature[], size: number): ParsedFeature[][] {
    if (features.length === 0) return [[{ name: "core", description: "Core business logic", complexity: 3, keywords: [] }]];
    const chunks: ParsedFeature[][] = [];
    for (let i = 0; i < features.length; i += size) {
      chunks.push(features.slice(i, i + size));
    }
    return chunks;
  }
}
