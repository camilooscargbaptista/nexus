/**
 * @camilooscargbaptista/nexus-core — Query Planner Tests
 */

import { describe, it, expect } from "@jest/globals";
import { QueryPlanner } from "../query-planner.js";
import type { PlanStep } from "../query-planner.js";

describe("QueryPlanner", () => {
  const planner = new QueryPlanner();

  describe("Pattern: analyze X and Y", () => {
    it("should decompose 'analyze X and Y' into parallel steps + merge", () => {
      const plan = planner.plan("analyze security and performance");

      expect(plan.decompositionMethod).toBe("pattern");
      expect(plan.steps.length).toBe(3); // 2 analyze + 1 merge

      const merge = plan.steps.find((s) => s.action === "merge-reports");
      expect(merge).toBeDefined();
      expect(merge!.dependencies.length).toBe(2);
    });

    it("should handle 'review X and Y'", () => {
      const plan = planner.plan("review authentication and authorization");

      expect(plan.decompositionMethod).toBe("pattern");
      expect(plan.steps.length).toBe(3);
    });
  });

  describe("Pattern: fix/refactor", () => {
    it("should decompose fix into analyze → plan → implement → verify", () => {
      const plan = planner.plan("fix the authentication bug");

      expect(plan.decompositionMethod).toBe("pattern");
      expect(plan.steps.length).toBe(4);
      expect(plan.steps.map((s) => s.id)).toEqual([
        "analyze",
        "plan",
        "implement",
        "verify",
      ]);
    });

    it("should handle 'refactor' pattern", () => {
      const plan = planner.plan("refactor the data access layer");
      expect(plan.steps.length).toBe(4);
    });

    it("should handle 'migrate' pattern", () => {
      const plan = planner.plan("migrate database from MySQL to PostgreSQL");
      expect(plan.steps.length).toBe(4);
    });
  });

  describe("Pattern: compare X with Y", () => {
    it("should decompose compare into parallel analyze + compare", () => {
      const plan = planner.plan("compare React with Angular");

      expect(plan.decompositionMethod).toBe("pattern");
      expect(plan.steps.length).toBe(3);

      const compareStep = plan.steps.find((s) => s.action === "compare-results");
      expect(compareStep).toBeDefined();
      expect(compareStep!.dependencies).toEqual(["analyze-a", "analyze-b"]);
    });

    it("should handle 'vs' syntax", () => {
      const plan = planner.plan("compare NestJS vs Express");
      expect(plan.steps.length).toBe(3);
    });
  });

  describe("Single-step Fallback", () => {
    it("should use single-step for simple objectives", () => {
      const plan = planner.plan("what is clean architecture");

      expect(plan.decompositionMethod).toBe("single-step");
      expect(plan.steps.length).toBe(1);
      expect(plan.complexity).toBe("simple");
    });
  });

  describe("Complexity Classification", () => {
    it("should classify simple plans", () => {
      const plan = planner.plan("what is SOLID");
      expect(plan.complexity).toBe("simple");
    });

    it("should classify moderate plans", () => {
      const plan = planner.plan("analyze security and performance");
      expect(plan.complexity).toBe("moderate");
    });

    it("should classify complex plans", () => {
      // fix/refactor = 4 steps → not really ≤ 5 but still moderate under default rules
      // Let's add a custom multi-step rule to test "complex"
      const customPlanner = new QueryPlanner();
      customPlanner.addRule({
        patterns: [/^mega/],
        template: () => {
          const steps: PlanStep[] = [];
          for (let i = 0; i < 7; i++) {
            steps.push({
              id: `step-${i}`,
              action: `action-${i}`,
              description: `Step ${i}`,
              dependencies: i > 0 ? [`step-${i - 1}`] : [],
              inputs: [],
              outputs: [],
              estimatedTokens: 1000,
            });
          }
          return steps;
        },
      });

      const plan = customPlanner.plan("mega complex operation");
      expect(plan.complexity).toBe("complex");
    });
  });

  describe("Custom Rules", () => {
    it("should support custom decomposition rules", () => {
      const customPlanner = new QueryPlanner();
      customPlanner.addRule({
        patterns: [/^deploy/i],
        template: () => [
          { id: "build", action: "build", description: "Build", dependencies: [], inputs: [], outputs: [], estimatedTokens: 2000 },
          { id: "deploy", action: "deploy", description: "Deploy", dependencies: ["build"], inputs: [], outputs: [], estimatedTokens: 1000 },
        ],
      });

      const plan = customPlanner.plan("deploy to production");
      expect(plan.steps.length).toBe(2);
      expect(plan.steps[0]!.action).toBe("build");
    });

    it("should prioritize custom rules over defaults", () => {
      const customPlanner = new QueryPlanner();
      customPlanner.addRule({
        patterns: [/\bfix\b/],
        template: () => [
          { id: "custom", action: "custom-fix", description: "Custom", dependencies: [], inputs: [], outputs: [], estimatedTokens: 500 },
        ],
      });

      const plan = customPlanner.plan("fix the bug");
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0]!.action).toBe("custom-fix");
    });
  });

  describe("Token Estimation", () => {
    it("should sum estimated tokens", () => {
      const plan = planner.plan("fix the issue");
      expect(plan.totalEstimatedTokens).toBe(
        plan.steps.reduce((s, step) => s + step.estimatedTokens, 0),
      );
      expect(plan.totalEstimatedTokens).toBeGreaterThan(0);
    });
  });
});
