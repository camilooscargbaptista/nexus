/**
 * @camilooscargbaptista/nexus-bridge — SkillMeta Tests
 */

import { describe, it, expect } from "@jest/globals";
import {
  SkillMetaSchema,
  SkillMetaBuilder,
  validateSkillMeta,
  parseSkillMeta,
} from "../skill-meta.js";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function validSkillInput() {
  return {
    name: "security-review",
    description: "Comprehensive security vulnerability analysis tool",
    version: "1.0.0",
    category: "security",
    triggers: {
      antiPatterns: ["xss", "sql_injection"],
      scoreBelowThreshold: 70,
    },
    preferredTier: "balanced",
    minConfidence: 0.4,
    dependsOn: [],
    estimatedTokens: 5000,
    tags: ["security", "owasp"],
    enabled: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("SkillMeta Schema Validation", () => {
  describe("Happy Path", () => {
    it("should validate a complete valid skill meta", () => {
      const result = validateSkillMeta(validSkillInput());
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("security-review");
    });

    it("should apply defaults for optional fields", () => {
      const result = validateSkillMeta({
        name: "my-skill",
        description: "A valid skill description here",
        version: "1.0.0",
        category: "testing",
        triggers: {},
        preferredTier: "fast",
      });

      expect(result.success).toBe(true);
      expect(result.data?.minConfidence).toBe(0.5);
      expect(result.data?.dependsOn).toEqual([]);
      expect(result.data?.estimatedTokens).toBe(3000);
      expect(result.data?.tags).toEqual([]);
      expect(result.data?.enabled).toBe(true);
    });

    it("should accept enhanced discovery fields", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        autoActivatePatterns: ["**/*.test.ts", "**/jest.config.*"],
        domainTags: ["testing", "quality"],
        modelTierOverride: { critical: "powerful" },
      });

      expect(result.success).toBe(true);
      expect(result.data?.autoActivatePatterns).toEqual([
        "**/*.test.ts",
        "**/jest.config.*",
      ]);
      expect(result.data?.domainTags).toEqual(["testing", "quality"]);
    });
  });

  describe("Validation Errors", () => {
    it("should reject empty name", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        name: "",
      });

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "name")).toBe(true);
    });

    it("should reject non-kebab-case name", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        name: "SecurityReview",
      });

      expect(result.success).toBe(false);
      expect(
        result.errors?.some((e) => e.message.includes("kebab-case")),
      ).toBe(true);
    });

    it("should reject short description", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        description: "short",
      });

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "description")).toBe(true);
    });

    it("should reject invalid semver version", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        version: "v1",
      });

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.field === "version")).toBe(true);
    });

    it("should reject invalid category", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        category: "invalid-category",
      });

      expect(result.success).toBe(false);
    });

    it("should reject minConfidence out of range", () => {
      const result = validateSkillMeta({
        ...validSkillInput(),
        minConfidence: 1.5,
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const result = validateSkillMeta({});
      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe("parseSkillMeta", () => {
    it("should return validated data", () => {
      const meta = parseSkillMeta(validSkillInput());
      expect(meta.name).toBe("security-review");
    });

    it("should throw on invalid input", () => {
      expect(() => parseSkillMeta({ name: "" })).toThrow();
    });
  });
});

describe("SkillMetaBuilder", () => {
  it("should build a valid skill meta with fluent API", () => {
    const meta = SkillMetaBuilder.create("code-quality-checker")
      .description("Analyzes code quality and suggests improvements")
      .version("1.0.0")
      .category("code-quality")
      .triggers({ scoreBelowThreshold: 60 })
      .preferredTier("fast")
      .tags(["quality", "lint"])
      .build();

    expect(meta.name).toBe("code-quality-checker");
    expect(meta.category).toBe("code-quality");
    expect(meta.preferredTier).toBe("fast");
    expect(meta.tags).toEqual(["quality", "lint"]);
  });

  it("should throw on invalid build", () => {
    expect(() =>
      SkillMetaBuilder.create("bad")
        .description("too short")
        .build(),
    ).toThrow();
  });

  it("should return validation result with tryBuild()", () => {
    const result = SkillMetaBuilder.create("valid-skill")
      .description("A sufficiently long description for validation")
      .version("2.0.0")
      .category("testing")
      .triggers({})
      .preferredTier("balanced")
      .tryBuild();

    expect(result.success).toBe(true);
    expect(result.data?.version).toBe("2.0.0");
  });

  it("should support auto-activate patterns", () => {
    const meta = SkillMetaBuilder.create("docker-skill")
      .description("Docker configuration analysis and review")
      .version("1.0.0")
      .category("devops")
      .triggers({ filePatterns: ["**/Dockerfile*"] })
      .preferredTier("balanced")
      .autoActivatePatterns(["**/Dockerfile*", "**/docker-compose.*"])
      .domainTags(["containers", "infrastructure"])
      .build();

    expect(meta.autoActivatePatterns).toEqual([
      "**/Dockerfile*",
      "**/docker-compose.*",
    ]);
    expect(meta.domainTags).toEqual(["containers", "infrastructure"]);
  });
});
