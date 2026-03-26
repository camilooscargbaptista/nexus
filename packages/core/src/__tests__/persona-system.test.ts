/**
 * Comprehensive Jest test suite for PersonaSystem
 *
 * Tests core functionality including:
 * - Constructor with default and custom personas
 * - Register/unregister operations
 * - Get, list with filters
 * - Matching personas by task description
 * - Prompt building with context injections
 * - Tool policies and model tier preferences
 * - Count and BUILT_IN_PERSONAS validation
 */

import { jest } from "@jest/globals";
import {
  PersonaSystem,
  BUILT_IN_PERSONAS,
  Persona,
  ContextInjection,
  type ToolPolicy,
} from "../persona-system.js";

// ───────────────────────────────────────────────────────────────
// HELPER: Create test personas
// ───────────────────────────────────────────────────────────────

function createTestPersona(overrides: Partial<Persona> = {}): Persona {
  const defaults: Persona = {
    id: "test-persona",
    name: "Test Persona",
    role: "tester",
    expertise: ["testing", "qa"],
    systemPrompt: "You are a test persona.",
    toolPolicy: "read-only",
    preferredTier: "balanced",
    enabled: true,
    tags: ["test"],
    contextInjections: [],
  };
  return { ...defaults, ...overrides };
}

// ───────────────────────────────────────────────────────────────
// TESTS
// ───────────────────────────────────────────────────────────────

describe("PersonaSystem", () => {
  describe("Constructor", () => {
    it("should load 12 built-in personas by default", () => {
      const system = new PersonaSystem();
      expect(system.count).toBe(12);
    });

    it("should load all BUILT_IN_PERSONAS", () => {
      const system = new PersonaSystem();
      for (const persona of BUILT_IN_PERSONAS) {
        expect(system.get(persona.id)).toBeDefined();
        expect(system.get(persona.id)).toEqual(persona);
      }
    });

    it("should accept custom personas via constructor", () => {
      const customPersona = createTestPersona({ id: "custom-dev" });
      const system = new PersonaSystem([customPersona]);
      expect(system.count).toBe(1);
      expect(system.get("custom-dev")).toEqual(customPersona);
    });

    it("should allow empty personas array", () => {
      const system = new PersonaSystem([]);
      expect(system.count).toBe(0);
    });

    it("should override default when custom personas provided", () => {
      const custom = createTestPersona({ id: "only-custom" });
      const system = new PersonaSystem([custom]);
      expect(system.get("security-auditor")).toBeUndefined();
      expect(system.get("only-custom")).toBeDefined();
    });
  });

  describe("register()", () => {
    it("should register a new persona", () => {
      const system = new PersonaSystem([]);
      const persona = createTestPersona({ id: "new-persona" });
      system.register(persona);
      expect(system.get("new-persona")).toEqual(persona);
    });

    it("should overwrite existing persona with same ID", () => {
      const system = new PersonaSystem();
      const original = system.get("security-auditor")!;
      const updated = { ...original, name: "Updated Auditor" };
      system.register(updated);
      expect(system.get("security-auditor")?.name).toBe("Updated Auditor");
    });

    it("should increment count on register", () => {
      const system = new PersonaSystem([]);
      expect(system.count).toBe(0);
      system.register(createTestPersona({ id: "p1" }));
      expect(system.count).toBe(1);
      system.register(createTestPersona({ id: "p2" }));
      expect(system.count).toBe(2);
    });
  });

  describe("unregister()", () => {
    it("should remove a registered persona", () => {
      const system = new PersonaSystem();
      expect(system.get("security-auditor")).toBeDefined();
      system.unregister("security-auditor");
      expect(system.get("security-auditor")).toBeUndefined();
    });

    it("should decrement count on unregister", () => {
      const system = new PersonaSystem();
      const initialCount = system.count;
      system.unregister("security-auditor");
      expect(system.count).toBe(initialCount - 1);
    });

    it("should silently handle unregistering non-existent persona", () => {
      const system = new PersonaSystem();
      const initialCount = system.count;
      system.unregister("non-existent-id");
      expect(system.count).toBe(initialCount);
    });
  });

  describe("get()", () => {
    it("should retrieve persona by ID", () => {
      const system = new PersonaSystem();
      const auditor = system.get("security-auditor");
      expect(auditor).toBeDefined();
      expect(auditor?.id).toBe("security-auditor");
      expect(auditor?.name).toBe("Security Auditor");
    });

    it("should return undefined for unknown ID", () => {
      const system = new PersonaSystem();
      expect(system.get("unknown-persona-id")).toBeUndefined();
    });

    it("should return exact persona object", () => {
      const system = new PersonaSystem();
      const p1 = system.get("security-auditor");
      const p2 = system.get("security-auditor");
      expect(p1).toBe(p2); // Same reference
    });
  });

  describe("list()", () => {
    it("should return all personas when no filter provided", () => {
      const system = new PersonaSystem();
      const all = system.list();
      expect(all.length).toBe(12);
      expect(all.map(p => p.id)).toContain("security-auditor");
      expect(all.map(p => p.id)).toContain("senior-developer");
    });

    it("should filter by role", () => {
      const system = new PersonaSystem();
      const verifiers = system.list({ role: "verifier" });
      expect(verifiers.length).toBeGreaterThan(0);
      expect(verifiers.every(p => p.role === "verifier")).toBe(true);
      const planners = system.list({ role: "planner" });
      expect(planners.every(p => p.role === "planner")).toBe(true);
    });

    it("should filter by tag", () => {
      const system = new PersonaSystem();
      const security = system.list({ tag: "security" });
      expect(security.length).toBeGreaterThan(0);
      expect(security.every(p => p.tags.includes("security"))).toBe(true);
    });

    it("should filter by enabled status", () => {
      const system = new PersonaSystem();
      const enabled = system.list({ enabled: true });
      expect(enabled.length).toBe(12); // All built-in are enabled
      expect(enabled.every(p => p.enabled === true)).toBe(true);

      const disabled = system.list({ enabled: false });
      expect(disabled.length).toBe(0);
    });

    it("should support combined filters", () => {
      const system = new PersonaSystem();
      const filtered = system.list({ role: "verifier", tag: "security" });
      expect(filtered.length).toBeGreaterThan(0);
      expect(
        filtered.every(
          p => p.role === "verifier" && p.tags.includes("security")
        )
      ).toBe(true);
    });

    it("should return empty array for filter with no matches", () => {
      const system = new PersonaSystem();
      const empty = system.list({ role: "non-existent-role" });
      expect(empty).toEqual([]);
    });
  });

  describe("matchPersonas()", () => {
    it("should match expertise keywords in task description", () => {
      const system = new PersonaSystem();
      const matches = system.matchPersonas("write secure code with authentication");
      expect(matches.length).toBeGreaterThan(0);
      const hasSecurityAuditor = matches.some(
        m => m.persona.id === "security-auditor"
      );
      expect(hasSecurityAuditor).toBe(true);
    });

    it("should return sorted by relevance score descending", () => {
      const system = new PersonaSystem();
      const matches = system.matchPersonas("owasp cve sql-injection xss");
      expect(matches.length).toBeGreaterThan(0);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          matches[i].relevanceScore
        );
      }
    });

    it("should respect maxResults limit", () => {
      const system = new PersonaSystem();
      const max1 = system.matchPersonas("testing", 1);
      expect(max1.length).toBeLessThanOrEqual(1);

      const max5 = system.matchPersonas("testing", 5);
      expect(max5.length).toBeLessThanOrEqual(5);
    });

    it("should skip disabled personas", () => {
      const system = new PersonaSystem();
      system.unregister("security-auditor");
      const matches = system.matchPersonas("owasp cve sql-injection");
      const hasSecurityAuditor = matches.some(
        m => m.persona.id === "security-auditor"
      );
      expect(hasSecurityAuditor).toBe(false);
    });

    it("should return empty array when no keywords match", () => {
      const system = new PersonaSystem();
      const matches = system.matchPersonas("xyz123 notarealkeyword qwerty");
      expect(matches).toEqual([]);
    });

    it("should compute relevance score correctly", () => {
      const system = new PersonaSystem();
      // "testing" matches test-engineer's expertise
      const matches = system.matchPersonas("unit-testing integration-testing");
      const match = matches.find(m => m.persona.id === "test-engineer");
      expect(match).toBeDefined();
      expect(match!.relevanceScore).toBeGreaterThan(0);
      expect(match!.relevanceScore).toBeLessThanOrEqual(1);
    });

    it("should include matchedExpertise in results", () => {
      const system = new PersonaSystem();
      const matches = system.matchPersonas("database microservices api-design");
      const archMatch = matches.find(m => m.persona.id === "backend-architect");
      expect(archMatch).toBeDefined();
      expect(archMatch!.matchedExpertise.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive", () => {
      const system = new PersonaSystem();
      const lower = system.matchPersonas("database");
      const upper = system.matchPersonas("DATABASE");
      const mixed = system.matchPersonas("DaTaBaSe");
      expect(lower.map(m => m.persona.id).sort()).toEqual(
        upper.map(m => m.persona.id).sort()
      );
      expect(lower.map(m => m.persona.id).sort()).toEqual(
        mixed.map(m => m.persona.id).sort()
      );
    });
  });

  describe("buildPrompt()", () => {
    it("should include persona name and role header", () => {
      const system = new PersonaSystem();
      const prompt = system.buildPrompt("security-auditor", "check this code");
      expect(prompt).toContain("[PERSONA: Security Auditor — verifier]");
    });

    it("should include system prompt", () => {
      const system = new PersonaSystem();
      const prompt = system.buildPrompt("security-auditor", "check this code");
      expect(prompt).toContain("You are a security auditor");
    });

    it("should prepend always context injections", () => {
      const system = new PersonaSystem();
      const prompt = system.buildPrompt("security-auditor", "user request");
      // Security auditor has a prepend injection
      expect(prompt).toContain("SECURITY CONTEXT:");
      const userPart = prompt.indexOf("---");
      const securityPart = prompt.indexOf("SECURITY CONTEXT:");
      expect(securityPart).toBeLessThan(userPart);
    });

    it("should append always context injections with append position", () => {
      const system = new PersonaSystem();
      system.register(
        createTestPersona({
          id: "append-test",
          contextInjections: [
            {
              trigger: "always" as const,
              content: "APPENDED CONTEXT",
              position: "append" as const,
            },
          ],
        })
      );
      const prompt = system.buildPrompt("append-test", "user request");
      expect(prompt).toContain("APPENDED CONTEXT");
      // The append injection is added to parts before the user prompt separator
      // so it appears in the prompt
      const appendIdx = prompt.lastIndexOf("APPENDED CONTEXT");
      const headerIdx = prompt.indexOf("[PERSONA:");
      expect(appendIdx).toBeGreaterThan(headerIdx);
    });

    it("should trigger on-match injections when keywords match", () => {
      const system = new PersonaSystem();
      // Backend architect has on-match injection for "database"
      const withMatch = system.buildPrompt(
        "backend-architect",
        "design database schema"
      );
      expect(withMatch).toContain("ARCHITECTURE PRINCIPLES:");

      const withoutMatch = system.buildPrompt(
        "backend-architect",
        "review frontend code"
      );
      expect(withoutMatch).not.toContain("ARCHITECTURE PRINCIPLES:");
    });

    it("should include user prompt at end with separator", () => {
      const system = new PersonaSystem();
      const userPrompt = "check this code for bugs";
      const prompt = system.buildPrompt("security-auditor", userPrompt);
      expect(prompt).toContain(`---\n${userPrompt}`);
      expect(prompt.indexOf("---")).toBeLessThan(prompt.length - 10);
    });

    it("should return plain userPrompt for unknown persona", () => {
      const system = new PersonaSystem();
      const userPrompt = "do something";
      const result = system.buildPrompt("unknown-id", userPrompt);
      expect(result).toBe(userPrompt);
    });

    it("should handle multiple context injections", () => {
      const system = new PersonaSystem();
      system.register(
        createTestPersona({
          id: "multi-inject",
          contextInjections: [
            { trigger: "always", content: "FIRST", position: "prepend" },
            { trigger: "always", content: "SECOND", position: "append" },
          ],
        })
      );
      const prompt = system.buildPrompt("multi-inject", "task");
      expect(prompt).toContain("FIRST");
      expect(prompt).toContain("SECOND");
      expect(prompt.indexOf("FIRST")).toBeLessThan(prompt.indexOf("SECOND"));
    });

    it("should handle on-match with multiple patterns", () => {
      const system = new PersonaSystem();
      system.register(
        createTestPersona({
          id: "multi-pattern",
          contextInjections: [
            {
              trigger: "on-match",
              matchPatterns: ["foo", "bar", "baz"],
              content: "MATCHED",
              position: "append",
            },
          ],
        })
      );
      const prompt1 = system.buildPrompt("multi-pattern", "contain foo here");
      expect(prompt1).toContain("MATCHED");

      const prompt2 = system.buildPrompt("multi-pattern", "contain bar here");
      expect(prompt2).toContain("MATCHED");

      const prompt3 = system.buildPrompt("multi-pattern", "nothing matches");
      expect(prompt3).not.toContain("MATCHED");
    });
  });

  describe("getToolPolicy()", () => {
    it("should return correct policy for security-auditor", () => {
      const system = new PersonaSystem();
      expect(system.getToolPolicy("security-auditor")).toBe("read-search");
    });

    it("should return correct policy for senior-developer", () => {
      const system = new PersonaSystem();
      expect(system.getToolPolicy("senior-developer")).toBe("full");
    });

    it("should return correct policy for penetration-tester", () => {
      const system = new PersonaSystem();
      expect(system.getToolPolicy("penetration-tester")).toBe("read-exec");
    });

    it("should return correct policy for cto-advisor", () => {
      const system = new PersonaSystem();
      expect(system.getToolPolicy("cto-advisor")).toBe("read-only");
    });

    it("should return read-only for unknown persona", () => {
      const system = new PersonaSystem();
      expect(system.getToolPolicy("unknown-persona")).toBe("read-only");
    });

    it("should return different policies for different personas", () => {
      const system = new PersonaSystem();
      const policies = new Set<ToolPolicy>();
      for (const persona of system.list()) {
        policies.add(system.getToolPolicy(persona.id));
      }
      expect(policies.size).toBeGreaterThan(1);
    });
  });

  describe("getPreferredTier()", () => {
    it("should return correct tier for security-auditor", () => {
      const system = new PersonaSystem();
      expect(system.getPreferredTier("security-auditor")).toBe("powerful");
    });

    it("should return correct tier for senior-developer", () => {
      const system = new PersonaSystem();
      expect(system.getPreferredTier("senior-developer")).toBe("balanced");
    });

    it("should return correct tier for cto-advisor", () => {
      const system = new PersonaSystem();
      expect(system.getPreferredTier("cto-advisor")).toBe("powerful");
    });

    it("should return balanced for unknown persona", () => {
      const system = new PersonaSystem();
      expect(system.getPreferredTier("unknown-persona")).toBe("balanced");
    });

    it("should only return valid tier values", () => {
      const system = new PersonaSystem();
      const validTiers = ["fast", "balanced", "powerful"];
      for (const persona of system.list()) {
        const tier = system.getPreferredTier(persona.id);
        expect(validTiers).toContain(tier);
      }
    });
  });

  describe("count property", () => {
    it("should return correct count for default system", () => {
      const system = new PersonaSystem();
      expect(system.count).toBe(12);
    });

    it("should return 0 for empty system", () => {
      const system = new PersonaSystem([]);
      expect(system.count).toBe(0);
    });

    it("should update count after register", () => {
      const system = new PersonaSystem([]);
      system.register(createTestPersona({ id: "p1" }));
      expect(system.count).toBe(1);
      system.register(createTestPersona({ id: "p2" }));
      expect(system.count).toBe(2);
    });

    it("should update count after unregister", () => {
      const system = new PersonaSystem();
      const initial = system.count;
      system.unregister("security-auditor");
      expect(system.count).toBe(initial - 1);
    });
  });

  describe("BUILT_IN_PERSONAS", () => {
    it("should have exactly 12 built-in personas", () => {
      expect(BUILT_IN_PERSONAS.length).toBe(12);
    });

    it("should have security cluster (2 personas)", () => {
      const securityCluster = BUILT_IN_PERSONAS.filter(p =>
        p.tags.includes("security")
      );
      expect(securityCluster.length).toBe(2);
      const ids = securityCluster.map(p => p.id);
      expect(ids).toContain("security-auditor");
      expect(ids).toContain("penetration-tester");
    });

    it("should have architecture cluster (3 personas)", () => {
      const archCluster = BUILT_IN_PERSONAS.filter(p =>
        p.tags.includes("architecture")
      );
      expect(archCluster.length).toBe(3);
      const ids = archCluster.map(p => p.id);
      expect(ids).toContain("backend-architect");
      expect(ids).toContain("frontend-architect");
      expect(ids).toContain("data-architect");
    });

    it("should have implementation cluster (2 personas)", () => {
      const implCluster = BUILT_IN_PERSONAS.filter(
        p =>
          (p.tags.includes("development") || p.tags.includes("testing")) &&
          !p.tags.includes("architecture")
      );
      expect(implCluster.length).toBe(2);
      const ids = implCluster.map(p => p.id);
      expect(ids).toContain("senior-developer");
      expect(ids).toContain("test-engineer");
    });

    it("should have devops cluster (2 personas)", () => {
      const devopsCluster = BUILT_IN_PERSONAS.filter(
        p =>
          p.tags.includes("devops") ||
          (p.tags.includes("reliability") && p.tags.includes("operations"))
      );
      expect(devopsCluster.length).toBe(2);
      const ids = devopsCluster.map(p => p.id);
      expect(ids).toContain("devops-engineer");
      expect(ids).toContain("sre");
    });

    it("should have leadership cluster (2 personas)", () => {
      const leadershipCluster = BUILT_IN_PERSONAS.filter(p =>
        p.tags.includes("leadership")
      );
      expect(leadershipCluster.length).toBe(2);
      const ids = leadershipCluster.map(p => p.id);
      expect(ids).toContain("tech-lead");
      expect(ids).toContain("cto-advisor");
    });

    it("should have adversarial cluster (1 persona)", () => {
      const adversarialCluster = BUILT_IN_PERSONAS.filter(p =>
        p.tags.includes("adversarial")
      );
      expect(adversarialCluster.length).toBe(1);
      expect(adversarialCluster[0].id).toBe("devils-advocate");
    });

    it("should have all personas enabled by default", () => {
      expect(BUILT_IN_PERSONAS.every(p => p.enabled === true)).toBe(true);
    });

    it("should have unique IDs", () => {
      const ids = BUILT_IN_PERSONAS.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have expertise array for each persona", () => {
      expect(
        BUILT_IN_PERSONAS.every(p => Array.isArray(p.expertise) && p.expertise.length > 0)
      ).toBe(true);
    });

    it("should have valid tool policies", () => {
      const validPolicies: ToolPolicy[] = ["read-only", "read-search", "read-exec", "full"];
      expect(
        BUILT_IN_PERSONAS.every(p => validPolicies.includes(p.toolPolicy))
      ).toBe(true);
    });

    it("should have valid preferred tiers", () => {
      const validTiers = ["fast", "balanced", "powerful"];
      expect(
        BUILT_IN_PERSONAS.every(p => validTiers.includes(p.preferredTier))
      ).toBe(true);
    });

    it("should have non-empty systemPrompt for each persona", () => {
      expect(
        BUILT_IN_PERSONAS.every(p => typeof p.systemPrompt === "string" && p.systemPrompt.length > 0)
      ).toBe(true);
    });

    it("should have tags array for each persona", () => {
      expect(
        BUILT_IN_PERSONAS.every(p => Array.isArray(p.tags) && p.tags.length > 0)
      ).toBe(true);
    });
  });

  describe("Integration scenarios", () => {
    it("should register, match, and build prompt for custom persona", () => {
      const system = new PersonaSystem([]);
      const custom = createTestPersona({
        id: "custom-reviewer",
        name: "Custom Code Reviewer",
        expertise: ["code-review", "testing"],
        contextInjections: [
          {
            trigger: "always",
            content: "Review for quality and best practices",
            position: "prepend",
          },
        ],
      });
      system.register(custom);

      const matches = system.matchPersonas("code review testing");
      expect(matches.some(m => m.persona.id === "custom-reviewer")).toBe(true);

      const prompt = system.buildPrompt("custom-reviewer", "review this");
      expect(prompt).toContain("Review for quality and best practices");
      expect(prompt).toContain("Custom Code Reviewer");
    });

    it("should handle persona lifecycle", () => {
      const system = new PersonaSystem();
      expect(system.count).toBe(12);

      system.unregister("security-auditor");
      expect(system.count).toBe(11);
      expect(system.get("security-auditor")).toBeUndefined();

      system.register(createTestPersona({ id: "security-auditor", name: "Updated Auditor" }));
      expect(system.count).toBe(12);
      expect(system.get("security-auditor")?.name).toBe("Updated Auditor");
    });
  });
});
