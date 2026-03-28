/**
 * @camilooscargbaptista/nexus-bridge — Architecture Generator
 *
 * Orquestrador que combina C4Generator + DataModelGenerator
 * para produzir documentação arquitetural completa nível SmartCollect.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { SpecParser } from "./spec-parser.js";
import type { ParsedSpec } from "./spec-parser.js";
import { C4Generator } from "./c4-generator.js";
import type { C4Diagram } from "./c4-generator.js";
import { DataModelGenerator } from "./data-model-generator.js";
import type { DataModelSchema, APISpec } from "./data-model-generator.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ArchitectureDoc {
  /** Spec parseada */
  parsed: ParsedSpec;
  /** Diagramas C4 (Level 1-3) */
  c4Diagrams: C4Diagram[];
  /** Schema de dados */
  dataModel: DataModelSchema;
  /** API spec */
  apiSpec: APISpec;
  /** Deployment spec */
  deploymentSpec: DeploymentSpec;
  /** Markdown completo */
  markdown: string;
  /** Metadata */
  metadata: {
    generatedAt: string;
    systemName: string;
    diagramCount: number;
    modelCount: number;
    endpointCount: number;
    wordCount: number;
  };
}

export interface DeploymentSpec {
  /** Docker Compose YAML */
  dockerCompose: string;
  /** Dockerfile */
  dockerfile: string;
  /** Ambiente (production/staging) */
  environments: string[];
}

export interface ArchitectureGeneratorConfig {
  /** Nome do sistema */
  systemName?: string;
  /** Include deployment specs */
  includeDeployment?: boolean;
  /** Include API spec */
  includeAPI?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// ARCHITECTURE GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Gera documentação arquitetural completa a partir de texto.
 *
 * @example
 * ```ts
 * const generator = new ArchitectureGenerator({ systemName: "SmartCollect" });
 *
 * const doc = generator.generate(
 *   "Sistema de negociação multi-channel com WhatsApp, Kafka, PostgreSQL..."
 * );
 *
 * console.log(doc.markdown);       // Documento C4 completo
 * console.log(doc.dataModel.prismaSchema); // Schema Prisma
 * console.log(doc.apiSpec.openApiYaml);    // OpenAPI spec
 * ```
 */
export class ArchitectureGenerator {
  private config: ArchitectureGeneratorConfig;

  constructor(config?: ArchitectureGeneratorConfig) {
    this.config = config ?? {};
  }

  /**
   * Gera documentação completa.
   */
  generate(input: string): ArchitectureDoc {
    // 1. Parse
    const parsed = SpecParser.parse(input);
    const systemName = this.config.systemName ?? parsed.title;

    // 2. C4 Diagrams
    const c4Diagrams = C4Generator.generate(parsed, { systemName });

    // 3. Data Model
    const dataModel = DataModelGenerator.generate(parsed);

    // 4. API Spec
    const apiSpec = this.config.includeAPI !== false
      ? DataModelGenerator.generateAPI(parsed)
      : { endpoints: [], openApiYaml: "" };

    // 5. Deployment
    const deploymentSpec = this.config.includeDeployment !== false
      ? this.generateDeployment(parsed, systemName)
      : { dockerCompose: "", dockerfile: "", environments: [] };

    // 6. Render Markdown
    const markdown = this.renderMarkdown(systemName, parsed, c4Diagrams, dataModel, apiSpec, deploymentSpec);

    return {
      parsed,
      c4Diagrams,
      dataModel,
      apiSpec,
      deploymentSpec,
      markdown,
      metadata: {
        generatedAt: new Date().toISOString(),
        systemName,
        diagramCount: c4Diagrams.length,
        modelCount: dataModel.models.length,
        endpointCount: apiSpec.endpoints.length,
        wordCount: markdown.split(/\s+/).length,
      },
    };
  }

  // ─── DEPLOYMENT GENERATION ──────────────────────────────

  private generateDeployment(spec: ParsedSpec, systemName: string): DeploymentSpec {
    const serviceName = systemName.toLowerCase().replace(/\s+/g, "-");
    const hasDb = spec.techStack.some((t) => ["PostgreSQL", "MongoDB"].includes(t));
    const hasRedis = spec.techStack.includes("Redis");
    const hasKafka = spec.techStack.includes("Kafka");

    // Dockerfile
    const dockerfile = [
      "FROM node:20-alpine AS builder",
      "WORKDIR /app",
      "COPY package*.json ./",
      "RUN npm ci --only=production",
      "COPY . .",
      "RUN npm run build",
      "",
      "FROM node:20-alpine",
      "WORKDIR /app",
      "COPY --from=builder /app/dist ./dist",
      "COPY --from=builder /app/node_modules ./node_modules",
      "COPY --from=builder /app/package.json ./",
      "EXPOSE 3000",
      "HEALTHCHECK CMD wget --spider http://localhost:3000/health || exit 1",
      'CMD ["node", "dist/main.js"]',
    ].join("\n");

    // Docker Compose
    const composeLines: string[] = [
      "version: '3.8'",
      "services:",
      `  ${serviceName}:`,
      `    build: .`,
      "    ports:",
      '      - "3000:3000"',
      "    environment:",
      "      - NODE_ENV=production",
    ];

    if (hasDb) {
      composeLines.push("      - DATABASE_URL=postgresql://postgres:postgres@db:5432/" + serviceName);
      composeLines.push("    depends_on:");
      composeLines.push("      - db");
      composeLines.push("");
      composeLines.push("  db:");
      composeLines.push("    image: postgres:16-alpine");
      composeLines.push("    environment:");
      composeLines.push("      POSTGRES_DB: " + serviceName);
      composeLines.push("      POSTGRES_PASSWORD: postgres");
      composeLines.push("    volumes:");
      composeLines.push("      - pgdata:/var/lib/postgresql/data");
      composeLines.push("    ports:");
      composeLines.push('      - "5432:5432"');
    }

    if (hasRedis) {
      composeLines.push("");
      composeLines.push("  redis:");
      composeLines.push("    image: redis:7-alpine");
      composeLines.push("    ports:");
      composeLines.push('      - "6379:6379"');
    }

    if (hasKafka) {
      composeLines.push("");
      composeLines.push("  kafka:");
      composeLines.push("    image: confluentinc/cp-kafka:7.5.0");
      composeLines.push("    ports:");
      composeLines.push('      - "9092:9092"');
      composeLines.push("    environment:");
      composeLines.push("      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092");
    }

    if (hasDb) {
      composeLines.push("");
      composeLines.push("volumes:");
      composeLines.push("  pgdata:");
    }

    return {
      dockerfile,
      dockerCompose: composeLines.join("\n"),
      environments: ["development", "staging", "production"],
    };
  }

  // ─── MARKDOWN RENDERING ─────────────────────────────────

  private renderMarkdown(
    systemName: string,
    spec: ParsedSpec,
    c4Diagrams: C4Diagram[],
    dataModel: DataModelSchema,
    apiSpec: APISpec,
    deploymentSpec: DeploymentSpec,
  ): string {
    const sections: string[] = [];

    // Header
    sections.push(`# ${systemName} — Architecture Document`);
    sections.push("");
    sections.push(`> Auto-generated by Nexus ArchitectureGenerator`);
    sections.push(`> Generated at: ${new Date().toISOString()}`);
    sections.push("");

    // Table of Contents
    sections.push("## Table of Contents");
    sections.push("1. System Context (C4 Level 1)");
    sections.push("2. Container Diagram (C4 Level 2)");
    sections.push("3. Component Diagram (C4 Level 3)");
    sections.push("4. Data Model");
    sections.push("5. API Specification");
    sections.push("6. Deployment");
    sections.push("");

    // C4 Diagrams
    for (const diagram of c4Diagrams) {
      sections.push(`## ${diagram.title}`);
      sections.push("");
      sections.push(diagram.description);
      sections.push("");
      sections.push("```mermaid");
      sections.push(diagram.mermaid);
      sections.push("```");
      sections.push("");
    }

    // Data Model
    sections.push("## 4. Data Model");
    sections.push("");
    sections.push("### Prisma Schema");
    sections.push("");
    sections.push("```prisma");
    sections.push(dataModel.prismaSchema);
    sections.push("```");
    sections.push("");

    // SQL Migrations
    if (dataModel.migrations.length > 0) {
      sections.push("### SQL Migrations");
      sections.push("");
      sections.push("```sql");
      sections.push(dataModel.migrations.join("\n\n"));
      sections.push("```");
      sections.push("");
    }

    // API Spec
    if (apiSpec.endpoints.length > 0) {
      sections.push("## 5. API Specification");
      sections.push("");
      sections.push(`| Method | Path | Description | Auth |`);
      sections.push(`|--------|------|-------------|------|`);
      for (const ep of apiSpec.endpoints) {
        sections.push(`| ${ep.method} | \`${ep.path}\` | ${ep.summary} | ${ep.auth ? "🔒" : "🔓"} |`);
      }
      sections.push("");
      sections.push("### OpenAPI Spec");
      sections.push("");
      sections.push("```yaml");
      sections.push(apiSpec.openApiYaml);
      sections.push("```");
      sections.push("");
    }

    // Deployment
    if (deploymentSpec.dockerfile) {
      sections.push("## 6. Deployment");
      sections.push("");
      sections.push("### Dockerfile");
      sections.push("");
      sections.push("```dockerfile");
      sections.push(deploymentSpec.dockerfile);
      sections.push("```");
      sections.push("");
      sections.push("### Docker Compose");
      sections.push("");
      sections.push("```yaml");
      sections.push(deploymentSpec.dockerCompose);
      sections.push("```");
      sections.push("");
    }

    return sections.join("\n");
  }
}
