/**
 * Tests for Declarative Skill Registry
 */

import { SkillRegistry, BUILT_IN_SKILLS } from "../skill-registry.js";
import type { SkillDescriptor, SkillTrigger } from "../skill-registry.js";
import type { ArchitectureSnapshot, Severity, Domain } from "@nexus/types";

// ─── Helpers ──────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ArchitectureSnapshot> = {}): ArchitectureSnapshot {
  return {
    projectPath: "/test",
    projectName: "test-project",
    timestamp: new Date().toISOString(),
    score: { overall: 75, modularity: 80, coupling: 70, cohesion: 75, layering: 75 },
    layers: [{ name: "src", type: "service", fileCount: 10, files: ["src/index.ts", "src/app.ts"] }],
    antiPatterns: [],
    dependencies: [],
    frameworks: [],
    domain: "saas" as Domain,
    fileCount: 100,
    lineCount: 10000,
    ...overrides,
  };
}

function makeSkill(name: string, triggers: SkillTrigger, overrides: Partial<SkillDescriptor> = {}): SkillDescriptor {
  return {
    name,
    description: `${name} skill`,
    version: "1.0.0",
    category: "code-quality",
    triggers,
    preferredTier: "balanced",
    minConfidence: 0.5,
    dependsOn: [],
    estimatedTokens: 3000,
    tags: [name],
    enabled: true,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  test("registers and retrieves skills", () => {
    const skill = makeSkill("test", { always: true });
    registry.register(skill);

    expect(registry.size).toBe(1);
    expect(registry.get("test")).toBe(skill);
  });

  test("unregisters skills", () => {
    registry.register(makeSkill("test", { always: true }));
    expect(registry.unregister("test")).toBe(true);
    expect(registry.size).toBe(0);
  });

  test("list filters by category", () => {
    registry.register(makeSkill("a", { always: true }, { category: "security" }));
    registry.register(makeSkill("b", { always: true }, { category: "testing" }));

    const security = registry.list({ category: "security" });
    expect(security).toHaveLength(1);
    expect(security[0].name).toBe("a");
  });

  test("list filters by enabled state", () => {
    registry.register(makeSkill("a", { always: true }, { enabled: true }));
    registry.register(makeSkill("b", { always: true }, { enabled: false }));

    expect(registry.list({ enabled: true })).toHaveLength(1);
    expect(registry.list({ enabled: false })).toHaveLength(1);
  });

  test("list filters by tag", () => {
    registry.register(makeSkill("a", { always: true }, { tags: ["owasp", "security"] }));
    registry.register(makeSkill("b", { always: true }, { tags: ["quality"] }));

    expect(registry.list({ tag: "owasp" })).toHaveLength(1);
  });
});

describe("SkillRegistry.activate", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  test("always-on skills are activated with high confidence", () => {
    registry.register(makeSkill("always-skill", { always: true }));

    const plan = registry.activate(makeSnapshot());
    expect(plan.skills).toHaveLength(1);
    expect(plan.skills[0].confidence).toBe(0.9);
    expect(plan.skills[0].matchReasons).toContain("Always-on skill");
  });

  test("anti-pattern trigger matches detected patterns", () => {
    registry.register(makeSkill("sec-skill", {
      antiPatterns: ["sql_injection", "xss"],
    }));

    const snapshot = makeSnapshot({
      antiPatterns: [{
        pattern: "sql_injection",
        severity: "critical" as Severity,
        location: "src/db.ts",
        description: "SQL injection detected",
        affectedFiles: ["src/db.ts"],
      }],
    });

    const plan = registry.activate(snapshot, { minConfidence: 0.1 });
    expect(plan.skills).toHaveLength(1);
    expect(plan.skills[0].matchReasons.some(r => r.includes("Anti-pattern"))).toBe(true);
  });

  test("score threshold trigger activates when score is low", () => {
    registry.register(makeSkill("quality-skill", {
      scoreBelowThreshold: 80,
    }));

    const plan = registry.activate(
      makeSnapshot({ score: { overall: 60, modularity: 50, coupling: 60, cohesion: 55, layering: 65 } }),
      { minConfidence: 0.1 },
    );
    expect(plan.skills).toHaveLength(1);
  });

  test("score threshold trigger does not activate when score is high", () => {
    registry.register(makeSkill("quality-skill", {
      scoreBelowThreshold: 50,
    }));

    const plan = registry.activate(
      makeSnapshot({ score: { overall: 75, modularity: 80, coupling: 70, cohesion: 75, layering: 75 } }),
      { minConfidence: 0.1 },
    );
    expect(plan.skills).toHaveLength(0);
  });

  test("framework trigger matches detected frameworks", () => {
    registry.register(makeSkill("nest-skill", {
      frameworks: ["nestjs"],
    }));

    const plan = registry.activate(
      makeSnapshot({ frameworks: ["nestjs", "typescript"] }),
      { minConfidence: 0.1 },
    );
    expect(plan.skills).toHaveLength(1);
  });

  test("domain trigger matches project domain", () => {
    registry.register(makeSkill("fintech-skill", {
      domains: ["fintech" as Domain],
    }));

    // Doesn't match saas
    let plan = registry.activate(makeSnapshot({ domain: "saas" as Domain }), { minConfidence: 0.1 });
    expect(plan.skills).toHaveLength(0);

    // Matches fintech
    plan = registry.activate(makeSnapshot({ domain: "fintech" as Domain }), { minConfidence: 0.1 });
    expect(plan.skills).toHaveLength(1);
  });

  test("dimension threshold trigger activates on low dimensions", () => {
    registry.register(makeSkill("coupling-skill", {
      dimensionThresholds: { coupling: 70 },
    }));

    const plan = registry.activate(
      makeSnapshot({ score: { overall: 75, modularity: 80, coupling: 50, cohesion: 75, layering: 75 } }),
      { minConfidence: 0.1 },
    );
    expect(plan.skills).toHaveLength(1);
  });

  test("filters skills below confidence threshold", () => {
    registry.register(makeSkill("low-conf", {
      frameworks: ["obscure-framework"],
    }));

    const plan = registry.activate(makeSnapshot(), { minConfidence: 0.5 });
    expect(plan.skills).toHaveLength(0);
    expect(plan.filtered.some(f => f.skill === "low-conf")).toBe(true);
  });

  test("excludes skills by name", () => {
    registry.register(makeSkill("excluded", { always: true }));
    registry.register(makeSkill("included", { always: true }));

    const plan = registry.activate(makeSnapshot(), { excludeSkills: ["excluded"] });
    expect(plan.skills).toHaveLength(1);
    expect(plan.skills[0].skill.name).toBe("included");
    expect(plan.filtered.some(f => f.skill === "excluded" && f.reason.includes("excluded"))).toBe(true);
  });

  test("force-includes skills even with low confidence", () => {
    registry.register(makeSkill("forced", {
      frameworks: ["nonexistent"],
    }));

    const plan = registry.activate(makeSnapshot(), {
      minConfidence: 0.3,
      forcedSkills: ["forced"],
    });
    expect(plan.skills).toHaveLength(1);
    expect(plan.skills[0].matchReasons).toContain("Force-included");
  });

  test("respects maxSkills limit", () => {
    for (let i = 0; i < 5; i++) {
      registry.register(makeSkill(`skill-${i}`, { always: true }));
    }

    const plan = registry.activate(makeSnapshot(), { maxSkills: 3 });
    expect(plan.skills).toHaveLength(3);
    expect(plan.filtered.filter(f => f.reason.includes("max skills"))).toHaveLength(2);
  });

  test("resolves dependency order", () => {
    registry.register(makeSkill("a", { always: true }, { dependsOn: ["b"] }));
    registry.register(makeSkill("b", { always: true }, { dependsOn: [] }));
    registry.register(makeSkill("c", { always: true }, { dependsOn: ["a"] }));

    const plan = registry.activate(makeSnapshot());
    expect(plan.executionOrder).toEqual(["b", "a", "c"]);
  });

  test("calculates total estimated tokens", () => {
    registry.register(makeSkill("a", { always: true }, { estimatedTokens: 5000 }));
    registry.register(makeSkill("b", { always: true }, { estimatedTokens: 3000 }));

    const plan = registry.activate(makeSnapshot());
    expect(plan.totalEstimatedTokens).toBe(8000);
  });

  test("disabled skills are filtered unless forced", () => {
    registry.register(makeSkill("disabled", { always: true }, { enabled: false }));

    let plan = registry.activate(makeSnapshot());
    expect(plan.skills).toHaveLength(0);
    expect(plan.filtered.some(f => f.reason.includes("disabled"))).toBe(true);

    plan = registry.activate(makeSnapshot(), { forcedSkills: ["disabled"] });
    expect(plan.skills).toHaveLength(1);
  });

  test("multiple triggers combine for higher confidence", () => {
    registry.register(makeSkill("multi-trigger", {
      antiPatterns: ["god_class"],
      scoreBelowThreshold: 80,
      frameworks: ["express"],
    }));

    // Only score matches
    const plan1 = registry.activate(
      makeSnapshot({ score: { overall: 60, modularity: 50, coupling: 60, cohesion: 55, layering: 65 } }),
      { minConfidence: 0.1 },
    );

    // Score + framework match
    const plan2 = registry.activate(
      makeSnapshot({
        score: { overall: 60, modularity: 50, coupling: 60, cohesion: 55, layering: 65 },
        frameworks: ["express"],
      }),
      { minConfidence: 0.1 },
    );

    expect(plan2.skills[0].confidence).toBeGreaterThan(plan1.skills[0].confidence);
  });
});

describe("BUILT_IN_SKILLS", () => {
  test("has correct number of built-in skills", () => {
    expect(BUILT_IN_SKILLS.length).toBe(6);
  });

  test("all built-in skills have required fields", () => {
    for (const skill of BUILT_IN_SKILLS) {
      expect(skill.name).toBeTruthy();
      expect(skill.version).toBeTruthy();
      expect(skill.category).toBeTruthy();
      expect(skill.estimatedTokens).toBeGreaterThan(0);
      expect(skill.tags.length).toBeGreaterThan(0);
    }
  });

  test("compliance-review depends on security-review", () => {
    const compliance = BUILT_IN_SKILLS.find(s => s.name === "compliance-review");
    expect(compliance).toBeDefined();
    expect(compliance!.dependsOn).toContain("security-review");
  });
});
