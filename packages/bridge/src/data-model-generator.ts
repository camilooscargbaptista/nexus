/**
 * @nexus/bridge — Data Model Generator
 *
 * Gera schemas de banco de dados (Prisma/PostgreSQL) e
 * API specs (OpenAPI) a partir de ParsedSpec.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { ParsedSpec } from "./spec-parser.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DataModelSchema {
  /** Prisma-style model definitions */
  models: ModelDefinition[];
  /** SQL migration statements */
  migrations: string[];
  /** Prisma schema string */
  prismaSchema: string;
}

export interface ModelDefinition {
  /** Nome do model */
  name: string;
  /** Campos */
  fields: FieldDefinition[];
  /** Relações */
  relations: RelationDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  defaultValue?: string;
  annotation?: string;
}

export interface RelationDefinition {
  name: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  target: string;
  foreignKey?: string;
}

export interface APISpec {
  /** OpenAPI-style endpoint definitions */
  endpoints: EndpointDefinition[];
  /** OpenAPI YAML string (simplified) */
  openApiYaml: string;
}

export interface EndpointDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  requestBody?: string;
  responseType: string;
  auth: boolean;
}

// ═══════════════════════════════════════════════════════════════
// COMMON FIELDS
// ═══════════════════════════════════════════════════════════════

const BASE_FIELDS: FieldDefinition[] = [
  { name: "id", type: "String", required: true, unique: true, defaultValue: "uuid()", annotation: "@id @default(uuid())" },
  { name: "createdAt", type: "DateTime", required: true, unique: false, defaultValue: "now()", annotation: "@default(now())" },
  { name: "updatedAt", type: "DateTime", required: true, unique: false, annotation: "@updatedAt" },
];

const STATUS_FIELD: FieldDefinition = {
  name: "status", type: "String", required: true, unique: false, defaultValue: "ACTIVE",
};

/** Campos inferidos para entidades comuns */
const ENTITY_FIELDS: Record<string, FieldDefinition[]> = {
  user: [
    { name: "email", type: "String", required: true, unique: true },
    { name: "name", type: "String", required: true, unique: false },
    { name: "passwordHash", type: "String", required: true, unique: false },
    { name: "role", type: "String", required: true, unique: false, defaultValue: "USER" },
  ],
  account: [
    { name: "name", type: "String", required: true, unique: false },
    { name: "type", type: "String", required: true, unique: false },
    { name: "balance", type: "Decimal", required: true, unique: false, defaultValue: "0" },
  ],
  payment: [
    { name: "amount", type: "Decimal", required: true, unique: false },
    { name: "currency", type: "String", required: true, unique: false, defaultValue: "BRL" },
    { name: "method", type: "String", required: true, unique: false },
    { name: "externalId", type: "String", required: false, unique: false },
  ],
  order: [
    { name: "total", type: "Decimal", required: true, unique: false },
    { name: "items", type: "Json", required: false, unique: false },
  ],
  product: [
    { name: "name", type: "String", required: true, unique: false },
    { name: "price", type: "Decimal", required: true, unique: false },
    { name: "description", type: "String", required: false, unique: false },
    { name: "sku", type: "String", required: true, unique: true },
  ],
  transaction: [
    { name: "amount", type: "Decimal", required: true, unique: false },
    { name: "type", type: "String", required: true, unique: false },
    { name: "reference", type: "String", required: false, unique: true },
  ],
  notification: [
    { name: "title", type: "String", required: true, unique: false },
    { name: "body", type: "String", required: true, unique: false },
    { name: "channel", type: "String", required: true, unique: false },
    { name: "readAt", type: "DateTime", required: false, unique: false },
  ],
  debt: [
    { name: "originalAmount", type: "Decimal", required: true, unique: false },
    { name: "currentAmount", type: "Decimal", required: true, unique: false },
    { name: "dueDate", type: "DateTime", required: true, unique: false },
    { name: "creditor", type: "String", required: true, unique: false },
  ],
  vehicle: [
    { name: "plate", type: "String", required: true, unique: true },
    { name: "model", type: "String", required: true, unique: false },
    { name: "year", type: "Int", required: true, unique: false },
  ],
  driver: [
    { name: "name", type: "String", required: true, unique: false },
    { name: "licenseNumber", type: "String", required: true, unique: true },
    { name: "phone", type: "String", required: true, unique: false },
  ],
};

/** Relações comuns entre entidades */
const COMMON_RELATIONS: Record<string, Array<{ target: string; type: RelationDefinition["type"] }>> = {
  user: [{ target: "account", type: "one-to-many" }, { target: "order", type: "one-to-many" }, { target: "notification", type: "one-to-many" }],
  order: [{ target: "payment", type: "one-to-one" }, { target: "product", type: "many-to-many" }],
  debt: [{ target: "payment", type: "one-to-many" }, { target: "transaction", type: "one-to-many" }],
  payment: [{ target: "transaction", type: "one-to-one" }],
  driver: [{ target: "vehicle", type: "one-to-many" }],
};

// ═══════════════════════════════════════════════════════════════
// DATA MODEL GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Gera schemas Prisma e SQL a partir de ParsedSpec.
 *
 * @example
 * ```ts
 * const schema = DataModelGenerator.generate(parsedSpec);
 * console.log(schema.prismaSchema);
 * // → model User { id String @id ... }
 * ```
 */
export class DataModelGenerator {
  /**
   * Gera schema completo.
   */
  static generate(spec: ParsedSpec): DataModelSchema {
    const models = this.generateModels(spec);
    const prismaSchema = this.renderPrisma(models);
    const migrations = this.renderMigrations(models);

    return { models, prismaSchema, migrations };
  }

  /**
   * Gera API spec OpenAPI.
   */
  static generateAPI(spec: ParsedSpec): APISpec {
    const endpoints = this.generateEndpoints(spec);
    const openApiYaml = this.renderOpenAPI(spec, endpoints);

    return { endpoints, openApiYaml };
  }

  // ─── MODEL GENERATION ───────────────────────────────────

  private static generateModels(spec: ParsedSpec): ModelDefinition[] {
    return spec.entities.slice(0, 10).map((entity) => {
      const name = this.pascalCase(entity);
      const fields = [
        ...BASE_FIELDS,
        ...(ENTITY_FIELDS[entity.toLowerCase()] ?? [{ name: "name", type: "String", required: true, unique: false }]),
        STATUS_FIELD,
      ];

      const relations = this.inferRelations(entity.toLowerCase(), spec.entities);

      return { name, fields, relations };
    });
  }

  private static inferRelations(entity: string, allEntities: string[]): RelationDefinition[] {
    const templates = COMMON_RELATIONS[entity] ?? [];
    return templates
      .filter((r) => allEntities.map((e) => e.toLowerCase()).includes(r.target))
      .map((r) => ({
        name: r.target,
        type: r.type,
        target: this.pascalCase(r.target),
        foreignKey: `${r.target}Id`,
      }));
  }

  // ─── PRISMA RENDERING ───────────────────────────────────

  private static renderPrisma(models: ModelDefinition[]): string {
    const lines: string[] = [];

    // Datasource
    lines.push("// Auto-generated by Nexus ArchitectureGenerator");
    lines.push("// Schema gerado para PostgreSQL");
    lines.push("");
    lines.push("datasource db {");
    lines.push('  provider = "postgresql"');
    lines.push('  url      = env("DATABASE_URL")');
    lines.push("}");
    lines.push("");
    lines.push("generator client {");
    lines.push('  provider = "prisma-client-js"');
    lines.push("}");
    lines.push("");

    for (const model of models) {
      lines.push(`model ${model.name} {`);

      for (const field of model.fields) {
        const opt = field.required ? "" : "?";
        const ann = field.annotation ? ` ${field.annotation}` : "";
        const def = field.defaultValue && !field.annotation ? ` @default("${field.defaultValue}")` : "";
        lines.push(`  ${field.name.padEnd(16)} ${field.type}${opt}${ann}${def}`);
      }

      for (const rel of model.relations) {
        if (rel.type === "one-to-many") {
          lines.push(`  ${rel.name}s${" ".repeat(Math.max(1, 14 - rel.name.length))} ${rel.target}[]`);
        } else if (rel.type === "one-to-one") {
          lines.push(`  ${rel.name}${" ".repeat(Math.max(1, 15 - rel.name.length))} ${rel.target}?  @relation(fields: [${rel.foreignKey}], references: [id])`);
          lines.push(`  ${rel.foreignKey}${" ".repeat(Math.max(1, 15 - (rel.foreignKey?.length ?? 0)))} String?`);
        }
      }

      lines.push("}");
      lines.push("");
    }

    return lines.join("\n");
  }

  // ─── SQL MIGRATIONS ─────────────────────────────────────

  private static renderMigrations(models: ModelDefinition[]): string[] {
    return models.map((model) => {
      const tableName = this.snakeCase(model.name) + "s";
      const cols = model.fields.map((f) => {
        const sqlType = this.prismaToSql(f.type);
        const nullable = f.required ? " NOT NULL" : "";
        const unique = f.unique ? " UNIQUE" : "";
        const pk = f.name === "id" ? " PRIMARY KEY" : "";
        return `  ${this.snakeCase(f.name)} ${sqlType}${pk}${nullable}${unique}`;
      });

      return `CREATE TABLE ${tableName} (\n${cols.join(",\n")}\n);`;
    });
  }

  // ─── API GENERATION ─────────────────────────────────────

  private static generateEndpoints(spec: ParsedSpec): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];

    for (const entity of spec.entities.slice(0, 8)) {
      const plural = entity.endsWith("s") ? entity : `${entity}s`;
      const name = this.pascalCase(entity);

      endpoints.push(
        { method: "GET", path: `/api/v1/${plural}`, summary: `List all ${plural}`, responseType: `${name}[]`, auth: true },
        { method: "POST", path: `/api/v1/${plural}`, summary: `Create ${entity}`, requestBody: `Create${name}Dto`, responseType: name, auth: true },
        { method: "GET", path: `/api/v1/${plural}/:id`, summary: `Get ${entity} by ID`, responseType: name, auth: true },
        { method: "PUT", path: `/api/v1/${plural}/:id`, summary: `Update ${entity}`, requestBody: `Update${name}Dto`, responseType: name, auth: true },
        { method: "DELETE", path: `/api/v1/${plural}/:id`, summary: `Delete ${entity}`, responseType: "void", auth: true },
      );
    }

    return endpoints;
  }

  private static renderOpenAPI(spec: ParsedSpec, endpoints: EndpointDefinition[]): string {
    const lines: string[] = [];
    lines.push("openapi: 3.0.3");
    lines.push("info:");
    lines.push(`  title: ${spec.title} API`);
    lines.push("  version: 1.0.0");
    lines.push(`  description: Auto-generated by Nexus ArchitectureGenerator`);
    lines.push("paths:");

    // Group by path
    const pathMap = new Map<string, EndpointDefinition[]>();
    for (const ep of endpoints) {
      const group = pathMap.get(ep.path) ?? [];
      group.push(ep);
      pathMap.set(ep.path, group);
    }

    for (const [path, eps] of pathMap) {
      lines.push(`  ${path}:`);
      for (const ep of eps) {
        lines.push(`    ${ep.method.toLowerCase()}:`);
        lines.push(`      summary: ${ep.summary}`);
        lines.push(`      security:`);
        lines.push(`        - bearerAuth: []`);
        lines.push(`      responses:`);
        lines.push(`        '200':`);
        lines.push(`          description: Success`);
      }
    }

    lines.push("components:");
    lines.push("  securitySchemes:");
    lines.push("    bearerAuth:");
    lines.push("      type: http");
    lines.push("      scheme: bearer");
    lines.push("      bearerFormat: JWT");

    return lines.join("\n");
  }

  // ─── HELPERS ─────────────────────────────────────────────

  private static pascalCase(s: string): string {
    return s.replace(/(^|\s|_|-)\w/g, (m) => m.toUpperCase()).replace(/[\s_-]/g, "");
  }

  private static snakeCase(s: string): string {
    return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
  }

  private static prismaToSql(type: string): string {
    const map: Record<string, string> = {
      String: "VARCHAR(255)", Int: "INTEGER", Decimal: "DECIMAL(10,2)",
      DateTime: "TIMESTAMP", Boolean: "BOOLEAN", Json: "JSONB", Float: "FLOAT",
    };
    return map[type] ?? "TEXT";
  }
}
