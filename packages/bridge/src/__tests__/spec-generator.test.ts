/**
 * @nexus/bridge — Spec Generator Tests (Sprint 12)
 */

import { describe, it, expect } from "@jest/globals";
import { SpecParser } from "../spec-parser.js";
import { SpecTemplate } from "../spec-template.js";
import { SpecGenerator } from "../spec-generator.js";

// ═══════════════════════════════════════════════════════════════
// SMARTCOLLECT-LIKE INPUT (benchmark)
// ═══════════════════════════════════════════════════════════════

const SMARTCOLLECT_INPUT =
  "Sistema de negociação de dívidas multi-channel com WhatsApp, Telegram e SMS. " +
  "Agentes de onboarding, transação, negociação e compliance. " +
  "Dashboard admin para gerenciamento. " +
  "Python + FastAPI + Kafka + PostgreSQL. " +
  "Deploy em Kubernetes na AWS. " +
  "Alta disponibilidade e segurança LGPD. " +
  "Integração com sistema legado via API REST.";

// ═══════════════════════════════════════════════════════════════
// SPEC PARSER
// ═══════════════════════════════════════════════════════════════

describe("SpecParser", () => {
  it("should parse SmartCollect-like input", () => {
    const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);

    expect(parsed.title).toBeDefined();
    expect(parsed.actors).toContain("admin");
    expect(parsed.actors).toContain("system");
    expect(parsed.techStack).toContain("Python");
    expect(parsed.techStack).toContain("Kafka");
    expect(parsed.techStack).toContain("PostgreSQL");
    expect(parsed.techStack).toContain("AWS");
  });

  it("should detect integrations", () => {
    const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);

    expect(parsed.integrations).toContain("WhatsApp");
    expect(parsed.integrations).toContain("Telegram");
    expect(parsed.integrations).toContain("SMS");
  });

  it("should detect NFRs", () => {
    const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);

    expect(parsed.nonFunctionalRequirements).toContain("Security");
    expect(parsed.nonFunctionalRequirements).toContain("High Availability");
  });

  it("should detect entities", () => {
    const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);

    expect(parsed.entities).toContain("transação");
  });

  it("should extract features from patterns", () => {
    const parsed = SpecParser.parse("Sistema de negociação de dívidas com dashboard de relatórios");

    expect(parsed.features.length).toBeGreaterThan(0);
  });

  it("should calculate confidence", () => {
    const rich = SpecParser.parse(SMARTCOLLECT_INPUT);
    const poor = SpecParser.parse("hello");

    expect(rich.confidence).toBeGreaterThan(poor.confidence);
    expect(rich.confidence).toBeGreaterThanOrEqual(60);
  });

  it("should parse minimal input", () => {
    const parsed = SpecParser.parse("API");

    expect(parsed.title).toBe("API");
    expect(parsed.confidence).toBeLessThan(50);
  });

  it("should detect Flutter mobile stack", () => {
    const parsed = SpecParser.parse("App mobile com Flutter e Dart para motoristas");

    expect(parsed.techStack).toContain("Flutter");
    expect(parsed.actors).toContain("driver");
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC TEMPLATE
// ═══════════════════════════════════════════════════════════════

describe("SpecTemplate", () => {
  const config = {
    projectName: "SmartCollect",
    templateType: "microservice" as const,
    actors: ["user", "admin", "system"],
    features: ["onboarding", "negociação", "compliance"],
    entities: ["user", "debt", "payment", "transaction"],
    techStack: ["Python", "Kafka", "PostgreSQL", "Docker", "AWS"],
    integrations: ["WhatsApp", "Telegram", "SMS"],
    nfrs: ["High Availability", "Security"],
  };

  it("should generate all 10 sections", () => {
    const sections = SpecTemplate.generate(config);

    expect(sections.length).toBe(10);
    expect(sections.map((s) => s.title)).toEqual([
      "Overview", "Actors", "Features", "Architecture",
      "Data Model", "API", "Integrations", "Deployment",
      "NFRs", "Tech Stack",
    ]);
  });

  it("should render complete markdown", () => {
    const markdown = SpecTemplate.render(config);

    expect(markdown).toContain("SmartCollect");
    expect(markdown).toContain("microservice");
    expect(markdown).toContain("WhatsApp");
    expect(markdown).toContain("Kafka");
    expect(markdown).toContain("mermaid");
  });

  it("should include C4 Mermaid diagram", () => {
    const sections = SpecTemplate.generate(config);
    const archSection = sections.find((s) => s.title === "Architecture")!;

    expect(archSection.content).toContain("graph TB");
    expect(archSection.content).toContain("SmartCollect");
    expect(archSection.content).toContain("Database");
  });

  it("should generate API endpoints from entities", () => {
    const sections = SpecTemplate.generate(config);
    const apiSection = sections.find((s) => s.title === "API")!;

    expect(apiSection.content).toContain("/api/v1/users");
    expect(apiSection.content).toContain("/api/v1/debts");
    expect(apiSection.content).toContain("GET");
    expect(apiSection.content).toContain("POST");
  });

  it("should generate deployment with K8s for Docker+AWS", () => {
    const sections = SpecTemplate.generate(config);
    const deploySection = sections.find((s) => s.title === "Deployment")!;

    expect(deploySection.content).toContain("Kubernetes");
  });

  it("should handle empty config gracefully", () => {
    const sections = SpecTemplate.generate({
      projectName: "Empty",
      templateType: "library",
      actors: [],
      features: [],
      entities: [],
      techStack: [],
      integrations: [],
      nfrs: [],
    });

    expect(sections.length).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC GENERATOR (INTEGRATION)
// ═══════════════════════════════════════════════════════════════

describe("SpecGenerator", () => {
  it("should generate full spec from text input", () => {
    const generator = new SpecGenerator();
    const spec = generator.generate(SMARTCOLLECT_INPUT);

    expect(spec.markdown).toContain("Technical Specification");
    expect(spec.metadata.sectionCount).toBe(10);
    expect(spec.metadata.confidence).toBeGreaterThanOrEqual(60);
    expect(spec.metadata.wordCount).toBeGreaterThan(50);
  });

  it("should infer microservice template for Kafka + integrations", () => {
    const generator = new SpecGenerator();
    const spec = generator.generate(SMARTCOLLECT_INPUT);

    expect(spec.metadata.templateType).toBe("microservice");
  });

  it("should infer mobile template for Flutter", () => {
    const generator = new SpecGenerator();
    const spec = generator.generate("App mobile com Flutter para motoristas");

    expect(spec.metadata.templateType).toBe("mobile");
  });

  it("should support custom project name", () => {
    const generator = new SpecGenerator({ projectName: "NexusProject" });
    const spec = generator.generate("simple system");

    expect(spec.markdown).toContain("NexusProject");
  });

  it("should generate lite version", () => {
    const generator = new SpecGenerator();
    const lite = generator.generateLite(SMARTCOLLECT_INPUT);

    expect(lite).toContain("Overview");
    expect(lite).toContain("Architecture");
    expect(lite).not.toContain("Deployment"); // lite excludes deployment
  });

  it("should support extra sections", () => {
    const generator = new SpecGenerator({
      extraSections: [{ title: "Risk Analysis", content: "High risk items..." }],
    });
    const spec = generator.generate("backend system with PostgreSQL");

    expect(spec.sections.length).toBe(11); // 10 + 1 extra
  });
});
