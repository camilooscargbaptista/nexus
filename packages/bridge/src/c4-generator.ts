/**
 * @camilooscargbaptista/nexus-bridge — C4 Generator
 *
 * Gera diagramas C4 (Context, Container, Component) como Mermaid
 * a partir de ParsedSpec e Epics.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { ParsedSpec } from "./spec-parser.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type C4Level = "context" | "container" | "component";

export interface C4Diagram {
  /** Nível do diagrama */
  level: C4Level;
  /** Título */
  title: string;
  /** Código Mermaid */
  mermaid: string;
  /** Descrição do diagrama */
  description: string;
}

export interface C4Config {
  /** Nome do sistema */
  systemName: string;
  /** Estilo visual */
  style: "default" | "detailed";
}

// ═══════════════════════════════════════════════════════════════
// CONTAINER PROFILES
// ═══════════════════════════════════════════════════════════════

interface ContainerDef {
  id: string;
  label: string;
  tech: string;
  type: "app" | "db" | "queue" | "cache" | "gateway" | "external";
}

const STACK_TO_CONTAINERS: Record<string, ContainerDef> = {
  "TypeScript": { id: "api", label: "API Server", tech: "NestJS/Express", type: "app" },
  "Python": { id: "api", label: "API Server", tech: "FastAPI/Django", type: "app" },
  "React": { id: "web", label: "Web App (SPA)", tech: "React/Next.js", type: "app" },
  "Flutter": { id: "mobile", label: "Mobile App", tech: "Flutter/Dart", type: "app" },
  "PostgreSQL": { id: "db", label: "Database", tech: "PostgreSQL", type: "db" },
  "MongoDB": { id: "db", label: "Database", tech: "MongoDB", type: "db" },
  "Redis": { id: "cache", label: "Cache", tech: "Redis/ElastiCache", type: "cache" },
  "Kafka": { id: "broker", label: "Message Broker", tech: "Apache Kafka", type: "queue" },
  "Docker": { id: "infra", label: "Container Runtime", tech: "Docker", type: "app" },
  "AWS": { id: "cloud", label: "Cloud Provider", tech: "AWS", type: "external" },
};

// ═══════════════════════════════════════════════════════════════
// C4 GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Gera diagramas C4 em Mermaid a partir de ParsedSpec.
 *
 * @example
 * ```ts
 * const diagrams = C4Generator.generate(parsedSpec, { systemName: "SmartCollect" });
 * // → 3 diagramas: Context, Container, Component
 * ```
 */
export class C4Generator {
  /**
   * Gera todos os 3 níveis C4.
   */
  static generate(spec: ParsedSpec, config?: Partial<C4Config>): C4Diagram[] {
    const systemName = config?.systemName ?? spec.title;

    return [
      this.generateContext(spec, systemName),
      this.generateContainer(spec, systemName),
      this.generateComponent(spec, systemName),
    ];
  }

  /**
   * Level 1: System Context — show the system in its environment.
   */
  static generateContext(spec: ParsedSpec, systemName: string): C4Diagram {
    const lines: string[] = ["graph TB"];

    // Style classes
    lines.push("  classDef person fill:#08427B,color:#fff,stroke:#073B6F");
    lines.push("  classDef system fill:#1168BD,color:#fff,stroke:#0D5AA7");
    lines.push("  classDef external fill:#999,color:#fff,stroke:#888");
    lines.push("");

    // Actors
    for (const actor of spec.actors) {
      const id = this.sanitizeId(actor);
      lines.push(`  ${id}["👤 ${this.capitalize(actor)}"]:::person`);
    }

    // Central system
    lines.push(`  system["🏗️ ${systemName}"]:::system`);

    // External integrations
    for (const int of spec.integrations) {
      const id = this.sanitizeId(int);
      lines.push(`  ${id}["🔌 ${int}"]:::external`);
    }

    // Connections
    for (const actor of spec.actors) {
      lines.push(`  ${this.sanitizeId(actor)} -->|"Uses"| system`);
    }
    for (const int of spec.integrations) {
      lines.push(`  system -->|"Integrates"| ${this.sanitizeId(int)}`);
    }

    // Database
    if (spec.techStack.some((t) => ["PostgreSQL", "MongoDB"].includes(t))) {
      lines.push(`  db["🗄️ Database"]:::external`);
      lines.push(`  system -->|"Reads/Writes"| db`);
    }

    return {
      level: "context",
      title: `${systemName} — System Context (C4 Level 1)`,
      mermaid: lines.join("\n"),
      description: `High-level view showing ${systemName} and its relationships with users and external systems.`,
    };
  }

  /**
   * Level 2: Container — zoom into the system, showing major containers.
   */
  static generateContainer(spec: ParsedSpec, systemName: string): C4Diagram {
    const lines: string[] = ["graph TB"];
    lines.push("  classDef app fill:#1168BD,color:#fff,stroke:#0D5AA7");
    lines.push("  classDef db fill:#2D882D,color:#fff,stroke:#226622");
    lines.push("  classDef queue fill:#DD8800,color:#fff,stroke:#BB7700");
    lines.push("  classDef cache fill:#AA3377,color:#fff,stroke:#882255");
    lines.push("  classDef ext fill:#999,color:#fff,stroke:#888");
    lines.push("");

    // Resolve containers from stack
    const containers = this.resolveContainers(spec);
    const containerIds = new Set<string>();

    for (const c of containers) {
      if (containerIds.has(c.id)) continue;
      containerIds.add(c.id);
      const cls = c.type === "db" ? "db" : c.type === "queue" ? "queue" : c.type === "cache" ? "cache" : c.type === "external" ? "ext" : "app";
      lines.push(`  ${c.id}["${c.label}<br/><small>${c.tech}</small>"]:::${cls}`);
    }

    // Container boundary
    lines.push("");
    lines.push(`  subgraph ${this.sanitizeId(systemName)}["${systemName}"]`);

    // Internal connections
    const hasApi = containerIds.has("api");
    const hasWeb = containerIds.has("web");
    const hasMobile = containerIds.has("mobile");
    const hasDb = containerIds.has("db");
    const hasBroker = containerIds.has("broker");
    const hasCache = containerIds.has("cache");

    if (hasApi && hasDb) lines.push(`    api -->|"SQL/ORM"| db`);
    if (hasApi && hasBroker) lines.push(`    api -->|"Publish Events"| broker`);
    if (hasApi && hasCache) lines.push(`    api -->|"Cache Queries"| cache`);
    if (hasWeb && hasApi) lines.push(`    web -->|"REST/GraphQL"| api`);
    if (hasMobile && hasApi) lines.push(`    mobile -->|"REST API"| api`);
    if (hasBroker && hasApi) lines.push(`    broker -->|"Consume Events"| api`);

    lines.push("  end");

    // External connections
    for (const int of spec.integrations) {
      const id = `ext_${this.sanitizeId(int)}`;
      lines.push(`  ${id}["🔌 ${int}"]:::ext`);
      if (hasApi) lines.push(`  api -->|"Webhook/API"| ${id}`);
    }

    return {
      level: "container",
      title: `${systemName} — Container Diagram (C4 Level 2)`,
      mermaid: lines.join("\n"),
      description: `Shows the major containers (applications, databases, message brokers) that make up ${systemName}.`,
    };
  }

  /**
   * Level 3: Component — zoom into the API container.
   */
  static generateComponent(spec: ParsedSpec, systemName: string): C4Diagram {
    const lines: string[] = ["graph TB"];
    lines.push("  classDef service fill:#1168BD,color:#fff,stroke:#0D5AA7");
    lines.push("  classDef controller fill:#438DD5,color:#fff,stroke:#3678B5");
    lines.push("  classDef repo fill:#85BBF0,color:#000,stroke:#5A9BD5");
    lines.push("");
    lines.push(`  subgraph api["API Server"]`);

    // Generate components from entities
    for (const entity of spec.entities.slice(0, 8)) {
      const name = this.capitalize(entity);
      const id = this.sanitizeId(entity);
      lines.push(`    ${id}_ctrl["${name}Controller"]:::controller`);
      lines.push(`    ${id}_svc["${name}Service"]:::service`);
      lines.push(`    ${id}_repo["${name}Repository"]:::repo`);
      lines.push(`    ${id}_ctrl --> ${id}_svc --> ${id}_repo`);
    }

    // Cross-entity connections
    if (spec.entities.length >= 2) {
      const e1 = this.sanitizeId(spec.entities[0]!);
      const e2 = this.sanitizeId(spec.entities[1]!);
      lines.push(`    ${e1}_svc -.->|"Uses"| ${e2}_svc`);
    }

    lines.push("  end");

    // External deps
    lines.push(`  db["🗄️ Database"]`);
    for (const entity of spec.entities.slice(0, 8)) {
      lines.push(`  ${this.sanitizeId(entity)}_repo --> db`);
    }

    return {
      level: "component",
      title: `${systemName} — Component Diagram (C4 Level 3)`,
      mermaid: lines.join("\n"),
      description: `Detailed view of the API Server components showing controllers, services, and repositories.`,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────────

  private static resolveContainers(spec: ParsedSpec): ContainerDef[] {
    const containers: ContainerDef[] = [];
    for (const tech of spec.techStack) {
      const container = STACK_TO_CONTAINERS[tech];
      if (container) containers.push(container);
    }
    return containers;
  }

  static sanitizeId(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
  }

  private static capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
