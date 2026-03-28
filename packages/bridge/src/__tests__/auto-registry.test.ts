/**
 * @camilooscargbaptista/nexus-bridge — AutoRegistry Tests
 */

import { describe, it, expect, jest } from "@jest/globals";
import { AutoRegistry } from "../auto-registry.js";
import type { FeatureModule } from "../auto-registry.js";
import type { SkillDescriptor } from "../skill-registry.js";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function makeValidModule(
  name: string,
  overrides: Partial<SkillDescriptor> = {},
): FeatureModule {
  return {
    meta: {
      name,
      description: `${name} — a valid skill for testing purposes`,
      version: "1.0.0",
      category: "testing",
      triggers: {},
      preferredTier: "balanced",
      minConfidence: 0.5,
      dependsOn: [],
      estimatedTokens: 3000,
      tags: ["test"],
      enabled: true,
      ...overrides,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("AutoRegistry", () => {
  describe("registerFromModules", () => {
    it("should register valid modules", () => {
      const registry = new AutoRegistry();
      const result = registry.registerFromModules([
        makeValidModule("skill-alpha"),
        makeValidModule("skill-beta"),
      ]);

      expect(result.registered.length).toBe(2);
      expect(result.failed.length).toBe(0);
      expect(result.scanned).toBe(2);
      expect(registry.size).toBe(2);
    });

    it("should reject invalid modules", () => {
      const registry = new AutoRegistry();
      const result = registry.registerFromModules([
        {
          meta: {
            name: "INVALID NAME",
            description: "too short",
          } as unknown as SkillDescriptor,
        },
      ]);

      expect(result.registered.length).toBe(0);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0]!.errors.length).toBeGreaterThan(0);
    });

    it("should deduplicate by name", () => {
      const registry = new AutoRegistry();
      registry.registerFromModules([
        makeValidModule("skill-alpha"),
        makeValidModule("skill-alpha"),
      ]);

      expect(registry.size).toBe(1);
    });

    it("should track source as manual by default", () => {
      const registry = new AutoRegistry();
      registry.registerFromModules([makeValidModule("my-skill")]);

      const manuals = registry.listBySource("manual");
      expect(manuals.length).toBe(1);
      expect(manuals[0]!.name).toBe("my-skill");
    });

    it("should track source as discovered when specified", () => {
      const registry = new AutoRegistry();
      registry.registerFromModules(
        [makeValidModule("auto-skill")],
        "discovered",
      );

      const discovered = registry.listBySource("discovered");
      expect(discovered.length).toBe(1);
      expect(discovered[0]!.name).toBe("auto-skill");
    });
  });

  describe("discoverFromEntries", () => {
    it("should register entries as discovered", async () => {
      const registry = new AutoRegistry();
      const result = await registry.discoverFromEntries([
        { name: "skill-a", module: makeValidModule("skill-a") },
        { name: "skill-b", module: makeValidModule("skill-b") },
      ]);

      expect(result.registered.length).toBe(2);
      expect(registry.listBySource("discovered").length).toBe(2);
    });
  });

  describe("Module Lifecycle", () => {
    it("should activate a skill", async () => {
      const activateFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const registry = new AutoRegistry();
      const mod = makeValidModule("lifecycle-skill");
      mod.activate = activateFn;

      registry.registerFromModules([mod]);
      const result = await registry.activateSkill("lifecycle-skill");

      expect(result).toBe(true);
      expect(activateFn).toHaveBeenCalledTimes(1);
    });

    it("should deactivate a skill", async () => {
      const deactivateFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const registry = new AutoRegistry();
      const mod = makeValidModule("cleanup-skill");
      mod.deactivate = deactivateFn;

      registry.registerFromModules([mod]);
      const result = await registry.deactivateSkill("cleanup-skill");

      expect(result).toBe(true);
      expect(deactivateFn).toHaveBeenCalledTimes(1);
    });

    it("should return false for non-existent skill", async () => {
      const registry = new AutoRegistry();
      expect(await registry.activateSkill("ghost")).toBe(false);
    });

    it("should return false if skill has no activate callback", async () => {
      const registry = new AutoRegistry();
      registry.registerFromModules([makeValidModule("no-hooks")]);
      expect(await registry.activateSkill("no-hooks")).toBe(false);
    });
  });

  describe("Registry Stats", () => {
    it("should report stats correctly", () => {
      const registry = new AutoRegistry();
      registry.registerFromModules([makeValidModule("manual-a")], "manual");
      registry.registerFromModules(
        [makeValidModule("auto-a"), makeValidModule("auto-b")],
        "discovered",
      );

      const stats = registry.registryStats();
      expect(stats.total).toBe(3);
      expect(stats.manual).toBe(1);
      expect(stats.discovered).toBe(2);
    });
  });

  describe("getModule", () => {
    it("should return the feature module", () => {
      const registry = new AutoRegistry();
      const mod = makeValidModule("findable");
      registry.registerFromModules([mod]);

      expect(registry.getModule("findable")).toBe(mod);
    });

    it("should return undefined for unknown skill", () => {
      const registry = new AutoRegistry();
      expect(registry.getModule("unknown")).toBeUndefined();
    });
  });
});
