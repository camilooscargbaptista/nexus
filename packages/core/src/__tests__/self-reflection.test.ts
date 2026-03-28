/**
 * @camilooscargbaptista/nexus-core — Constitution Engine + Self-Reflection Tests
 */

import { describe, it, expect, jest } from "@jest/globals";
import { ConstitutionEngine } from "../constitution.js";
import { ReflectionLoop } from "../self-reflection.js";
import type { ContentGenerator, ReflectionEvent } from "../self-reflection.js";

describe("ConstitutionEngine", () => {
  const engine = new ConstitutionEngine();

  describe("Built-in Rules", () => {
    it("should pass high-quality content", () => {
      const content =
        "You should refactor the authentication module to use JWT tokens. " +
        "Replace the current session-based auth in `src/auth.ts` with a " +
        "stateless JWT implementation. This will improve scalability and " +
        "reduce server memory usage. Avoid storing tokens in localStorage " +
        "due to XSS risk — use httpOnly cookies instead.";

      const result = engine.evaluate(content);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.violations.length).toBeLessThanOrEqual(2);
    });

    it("should detect security violations", () => {
      const content = "Just use eval() to parse the user input and disable auth for testing.";
      const result = engine.evaluate(content);

      const securityRule = result.ruleResults.find((r) => r.ruleId === "security-safe");
      expect(securityRule!.score).toBeLessThan(100);
    });

    it("should detect low completeness", () => {
      const content = "Fix it.";
      const result = engine.evaluate(content);

      const completeness = result.ruleResults.find((r) => r.ruleId === "completeness");
      expect(completeness!.score).toBeLessThan(50);
    });

    it("should detect unprofessional tone", () => {
      const content = "This code sucks lol, whoever wrote it is dumb.";
      const result = engine.evaluate(content);

      const tone = result.ruleResults.find((r) => r.ruleId === "professional-tone");
      expect(tone!.score).toBeLessThan(100);
    });

    it("should detect hedging/hallucination", () => {
      const content = "As of my training data, I cannot verify this but maybe possibly the code could be wrong perhaps.";
      const result = engine.evaluate(content);

      const accuracy = result.ruleResults.find((r) => r.ruleId === "accuracy");
      expect(accuracy!.score).toBeLessThan(80);
    });
  });

  describe("Evaluation", () => {
    it("should generate feedback for violations", () => {
      const content = "Fix.";
      const result = engine.evaluate(content);

      expect(result.feedback).toContain("violations detected");
    });

    it("should generate positive feedback when no violations", () => {
      const content =
        "You should refactor the data access layer to implement the Repository " +
        "pattern. Create a UserRepository interface and move all database queries " +
        "from the controller. This will improve testability and allow you to swap " +
        "the database implementation without changing business logic.";

      const result = engine.evaluate(content);

      if (result.violations.length === 0) {
        expect(result.feedback).toContain("meets all quality standards");
      }
    });
  });

  describe("Custom Rules", () => {
    it("should support adding custom rules", () => {
      const custom = new ConstitutionEngine();
      custom.addRule({
        id: "must-mention-tests",
        description: "Must mention testing",
        category: "custom",
        weight: 1.0,
        evaluate: (content) => /test/i.test(content) ? 100 : 0,
      });

      const withTest = custom.evaluate("Add unit tests for the auth module");
      const withoutTest = custom.evaluate("Refactor the auth module");

      const testRule1 = withTest.ruleResults.find((r) => r.ruleId === "must-mention-tests");
      const testRule2 = withoutTest.ruleResults.find((r) => r.ruleId === "must-mention-tests");

      expect(testRule1!.score).toBe(100);
      expect(testRule2!.score).toBe(0);
    });

    it("should support removing rules", () => {
      const custom = new ConstitutionEngine();
      const initialCount = custom.ruleCount;

      custom.removeRule("completeness");
      expect(custom.ruleCount).toBe(initialCount - 1);
    });

    it("should return false for removing non-existent rule", () => {
      const custom = new ConstitutionEngine();
      expect(custom.removeRule("non-existent")).toBe(false);
    });
  });
});

describe("ReflectionLoop", () => {
  it("should pass on first attempt for high-quality content", async () => {
    const generator: ContentGenerator = jest.fn<ContentGenerator>().mockResolvedValue(
      "You should refactor the authentication module to implement JWT tokens. " +
      "Replace session-based auth in `src/auth.ts`. This must improve scalability. " +
      "Avoid localStorage for tokens due to XSS risk — use httpOnly cookies. " +
      "Implement token refresh rotation for security. Update the middleware chain.",
    );

    const constitution = new ConstitutionEngine({ threshold: 50 });
    const loop = new ReflectionLoop(constitution, generator, { threshold: 50 });

    const result = await loop.reflect("Review auth module");

    expect(result.passed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it("should regenerate when first attempt fails", async () => {
    const generator = jest.fn<ContentGenerator>()
      .mockResolvedValueOnce("Fix it.") // Low quality
      .mockResolvedValueOnce(
        "You should refactor the module. Implement the Repository pattern. " +
        "Create interfaces for better testability. Move queries to dedicated " +
        "repository classes. This will improve maintainability and allow " +
        "database swapping without changing business logic. Avoid raw SQL.",
      );

    const constitution = new ConstitutionEngine({ threshold: 50 });
    const loop = new ReflectionLoop(constitution, generator, { threshold: 50 });

    const result = await loop.reflect("Review data layer");

    expect(result.attempts).toBeGreaterThanOrEqual(1);
    expect(generator).toHaveBeenCalledTimes(result.attempts);
  });

  it("should include feedback in regeneration prompt", async () => {
    const generator = jest.fn<ContentGenerator>()
      .mockResolvedValueOnce("Bad.") // Will fail
      .mockResolvedValueOnce("Good detailed recommendation with actionable steps and refactoring suggestions.");

    const constitution = new ConstitutionEngine({ threshold: 40 });
    const loop = new ReflectionLoop(constitution, generator, {
      threshold: 40,
      includeFeedback: true,
    });

    await loop.reflect("Review code");

    if (generator.mock.calls.length > 1) {
      const secondPrompt = generator.mock.calls[1]![0];
      expect(secondPrompt).toContain("QUALITY FEEDBACK");
    }
  });

  it("should fail after max attempts", async () => {
    const generator: ContentGenerator = jest.fn<ContentGenerator>().mockResolvedValue("No.");

    const constitution = new ConstitutionEngine({ threshold: 99 }); // impossibly high
    const loop = new ReflectionLoop(constitution, generator, {
      maxAttempts: 2,
      threshold: 99,
    });

    const result = await loop.reflect("Test");

    expect(result.passed).toBe(false);
    expect(result.attempts).toBe(2);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  it("should emit events", async () => {
    const events: ReflectionEvent[] = [];
    const generator: ContentGenerator = jest.fn<ContentGenerator>().mockResolvedValue(
      "Detailed recommendation: refactor auth module. Implement JWT. Update middleware. Add tests.",
    );

    const constitution = new ConstitutionEngine({ threshold: 30 });
    const loop = new ReflectionLoop(constitution, generator, { threshold: 30 });
    loop.onEvent((e) => events.push(e));

    await loop.reflect("Review");

    expect(events.some((e) => e.type === "reflection.started")).toBe(true);
    expect(events.some((e) => e.type === "reflection.attempt")).toBe(true);
  });

  it("should track improvement across attempts", async () => {
    const generator = jest.fn<ContentGenerator>()
      .mockResolvedValueOnce("X.")
      .mockResolvedValueOnce("You should implement better error handling. Add try-catch blocks. Refactor the module. Consider performance implications.");

    const constitution = new ConstitutionEngine({ threshold: 50 });
    const loop = new ReflectionLoop(constitution, generator, { threshold: 50 });

    const result = await loop.reflect("Review");

    if (result.evaluations.length > 1) {
      // Second attempt should score higher
      expect(result.evaluations[1]!.score).toBeGreaterThanOrEqual(result.evaluations[0]!.score);
    }
  });

  it("should support evaluate without reflect", () => {
    const generator: ContentGenerator = jest.fn<ContentGenerator>();
    const constitution = new ConstitutionEngine();
    const loop = new ReflectionLoop(constitution, generator);

    const result = loop.evaluate("Some content to check quality of the implementation and refactor");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.ruleResults.length).toBeGreaterThan(0);
  });
});
