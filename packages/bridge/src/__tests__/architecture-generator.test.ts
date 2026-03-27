/**
 * @nexus/bridge — Architecture Generator Tests (Sprint 14)
 */

import { describe, it, expect } from "@jest/globals";
import { SpecParser } from "../spec-parser.js";
import { C4Generator } from "../c4-generator.js";
import { DataModelGenerator } from "../data-model-generator.js";
import { ArchitectureGenerator } from "../architecture-generator.js";

const SMARTCOLLECT_INPUT =
  "Sistema de negociação de dívidas multi-channel com WhatsApp, Telegram e SMS. " +
  "Agentes de onboarding, transação, negociação e compliance. " +
  "Dashboard admin para gerenciamento. " +
  "Python + FastAPI + Kafka + PostgreSQL. " +
  "Deploy em Kubernetes na AWS. " +
  "Alta disponibilidade e segurança LGPD.";

const PARSED = SpecParser.parse(SMARTCOLLECT_INPUT);

// ═══════════════════════════════════════════════════════════════
// C4 GENERATOR
// ═══════════════════════════════════════════════════════════════

describe("C4Generator", () => {
  it("should generate 3 C4 levels", () => {
    const diagrams = C4Generator.generate(PARSED, { systemName: "SmartCollect" });

    expect(diagrams.length).toBe(3);
    expect(diagrams.map((d) => d.level)).toEqual(["context", "container", "component"]);
  });

  it("should generate valid Mermaid for Context diagram", () => {
    const diagram = C4Generator.generateContext(PARSED, "SmartCollect");

    expect(diagram.mermaid).toContain("graph TB");
    expect(diagram.mermaid).toContain("SmartCollect");
    expect(diagram.mermaid).toContain("Uses");
    expect(diagram.level).toBe("context");
  });

  it("should generate Container diagram with tech stack", () => {
    const diagram = C4Generator.generateContainer(PARSED, "SmartCollect");

    expect(diagram.mermaid).toContain("SmartCollect");
    expect(diagram.mermaid).toContain("broker");
    expect(diagram.mermaid).toContain("Kafka");
    expect(diagram.level).toBe("container");
  });

  it("should generate Component diagram with entities", () => {
    const diagram = C4Generator.generateComponent(PARSED, "SmartCollect");

    expect(diagram.mermaid).toContain("Controller");
    expect(diagram.mermaid).toContain("Service");
    expect(diagram.mermaid).toContain("Repository");
    expect(diagram.level).toBe("component");
  });

  it("should include external integrations in Context", () => {
    const diagram = C4Generator.generateContext(PARSED, "SmartCollect");

    expect(diagram.mermaid).toContain("WhatsApp");
    expect(diagram.mermaid).toContain("Telegram");
  });

  it("should include Database node", () => {
    const diagram = C4Generator.generateContext(PARSED, "SmartCollect");

    expect(diagram.mermaid).toContain("Database");
  });
});

// ═══════════════════════════════════════════════════════════════
// DATA MODEL GENERATOR
// ═══════════════════════════════════════════════════════════════

describe("DataModelGenerator", () => {
  it("should generate Prisma schema from entities", () => {
    const schema = DataModelGenerator.generate(PARSED);

    expect(schema.prismaSchema).toContain("model");
    expect(schema.prismaSchema).toContain("@id");
    expect(schema.prismaSchema).toContain("postgresql");
    expect(schema.models.length).toBeGreaterThan(0);
  });

  it("should generate SQL migrations", () => {
    const schema = DataModelGenerator.generate(PARSED);

    expect(schema.migrations.length).toBeGreaterThan(0);
    expect(schema.migrations[0]).toContain("CREATE TABLE");
  });

  it("should include base fields (id, createdAt, updatedAt)", () => {
    const schema = DataModelGenerator.generate(PARSED);

    for (const model of schema.models) {
      const fieldNames = model.fields.map((f) => f.name);
      expect(fieldNames).toContain("id");
      expect(fieldNames).toContain("createdAt");
      expect(fieldNames).toContain("updatedAt");
    }
  });

  it("should generate API spec with CRUD endpoints", () => {
    const api = DataModelGenerator.generateAPI(PARSED);

    expect(api.endpoints.length).toBeGreaterThan(0);
    expect(api.endpoints.some((e) => e.method === "GET")).toBe(true);
    expect(api.endpoints.some((e) => e.method === "POST")).toBe(true);
    expect(api.endpoints.some((e) => e.method === "PUT")).toBe(true);
    expect(api.endpoints.some((e) => e.method === "DELETE")).toBe(true);
  });

  it("should generate OpenAPI YAML", () => {
    const api = DataModelGenerator.generateAPI(PARSED);

    expect(api.openApiYaml).toContain("openapi: 3.0.3");
    expect(api.openApiYaml).toContain("bearerAuth");
    expect(api.openApiYaml).toContain("paths:");
  });

  it("should infer relations between entities", () => {
    const userInput = "Sistema com user, account, payment, transaction";
    const parsed = SpecParser.parse(userInput);
    const schema = DataModelGenerator.generate(parsed);

    const userModel = schema.models.find((m) => m.name === "User");
    if (userModel) {
      expect(userModel.relations.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ARCHITECTURE GENERATOR (INTEGRATION)
// ═══════════════════════════════════════════════════════════════

describe("ArchitectureGenerator", () => {
  it("should generate complete architecture doc", () => {
    const generator = new ArchitectureGenerator({ systemName: "SmartCollect" });
    const doc = generator.generate(SMARTCOLLECT_INPUT);

    expect(doc.c4Diagrams.length).toBe(3);
    expect(doc.dataModel.models.length).toBeGreaterThan(0);
    expect(doc.apiSpec.endpoints.length).toBeGreaterThan(0);
    expect(doc.markdown).toContain("SmartCollect");
  });

  it("should generate Dockerfile and docker-compose", () => {
    const generator = new ArchitectureGenerator();
    const doc = generator.generate(SMARTCOLLECT_INPUT);

    expect(doc.deploymentSpec.dockerfile).toContain("FROM node:20-alpine");
    expect(doc.deploymentSpec.dockerCompose).toContain("services:");
    expect(doc.deploymentSpec.environments).toContain("production");
  });

  it("should include Kafka in docker-compose for Kafka stack", () => {
    const generator = new ArchitectureGenerator();
    const doc = generator.generate(SMARTCOLLECT_INPUT);

    expect(doc.deploymentSpec.dockerCompose).toContain("kafka");
  });

  it("should include all sections in markdown", () => {
    const generator = new ArchitectureGenerator({ systemName: "TestSystem" });
    const doc = generator.generate(SMARTCOLLECT_INPUT);

    expect(doc.markdown).toContain("Architecture Document");
    expect(doc.markdown).toContain("System Context");
    expect(doc.markdown).toContain("Container Diagram");
    expect(doc.markdown).toContain("Component Diagram");
    expect(doc.markdown).toContain("Data Model");
    expect(doc.markdown).toContain("Prisma Schema");
    expect(doc.markdown).toContain("API Specification");
    expect(doc.markdown).toContain("Deployment");
  });

  it("should populate metadata correctly", () => {
    const generator = new ArchitectureGenerator({ systemName: "MetaTest" });
    const doc = generator.generate(SMARTCOLLECT_INPUT);

    expect(doc.metadata.systemName).toBe("MetaTest");
    expect(doc.metadata.diagramCount).toBe(3);
    expect(doc.metadata.modelCount).toBeGreaterThan(0);
    expect(doc.metadata.endpointCount).toBeGreaterThan(0);
    expect(doc.metadata.wordCount).toBeGreaterThan(100);
  });

  it("should work without deployment if disabled", () => {
    const generator = new ArchitectureGenerator({ includeDeployment: false });
    const doc = generator.generate(SMARTCOLLECT_INPUT);

    expect(doc.deploymentSpec.dockerfile).toBe("");
    expect(doc.deploymentSpec.dockerCompose).toBe("");
  });
});
