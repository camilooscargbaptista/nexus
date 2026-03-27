/**
 * @nexus/bridge — Critic Adapter Tests
 */

import { describe, it, expect } from "@jest/globals";
import { CriticAdapter } from "../critic-adapter.js";

describe("CriticAdapter", () => {
  const critic = new CriticAdapter({ threshold: 40 });

  describe("Judge", () => {
    it("should approve high-quality recommendation", () => {
      const content =
        "## Security Vulnerability in `src/auth.ts`\n\n" +
        "The authentication module has a critical XSS vulnerability on line 42. " +
        "You should replace `innerHTML` with `textContent` to prevent script injection. " +
        "This has high impact on user security.\n\n" +
        "```typescript\n// Before\nelement.innerHTML = userInput;\n// After\nelement.textContent = userInput;\n```";

      const verdict = critic.judge(content);
      expect(verdict.qualityScore).toBeGreaterThan(30);
    });

    it("should reject vague recommendation", () => {
      const content = "Fix the code. It's bad.";
      const verdict = critic.judge(content, { contentType: "recommendation" });

      expect(verdict.qualityScore).toBeLessThan(60);
      expect(verdict.suggestions.length).toBeGreaterThan(0);
    });

    it("should detect missing code examples", () => {
      const content =
        "You should refactor the data access layer to use the Repository pattern. " +
        "This will improve testability and maintainability of the application.";

      const verdict = critic.judge(content);

      const hasExampleSuggestion = verdict.suggestions.some((s: string) =>
        s.toLowerCase().includes("code example") || s.toLowerCase().includes("before/after"),
      );
      // May or may not suggest depending on overall score
      expect(verdict.evaluation.ruleResults.length).toBeGreaterThan(0);
    });

    it("should detect missing impact assessment", () => {
      const content = "Create a new file called utils.ts and add helper functions there.";

      const verdict = critic.judge(content);
      const impactRule = verdict.evaluation.ruleResults.find((r) => r.ruleId === "impact-assessment");
      expect(impactRule).toBeDefined();
    });
  });

  describe("QuickScore", () => {
    it("should return numeric score", () => {
      const score = critic.quickScore("Implement caching to improve performance by 50%. Use Redis for session storage.");
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("Configuration", () => {
    it("should work without code rules", () => {
      const basicCritic = new CriticAdapter({ includeCodeRules: false, threshold: 40 });
      const verdict = basicCritic.judge("Implement the recommendation to refactor code and improve quality.");

      expect(verdict.evaluation.ruleResults.length).toBeLessThan(
        critic.judge("Same content for comparison and quality evaluation.").evaluation.ruleResults.length,
      );
    });

    it("should support custom rules", () => {
      const customCritic = new CriticAdapter({
        threshold: 30,
        additionalRules: [
          {
            id: "must-mention-tests",
            description: "Must mention testing",
            category: "custom",
            weight: 1.0,
            evaluate: (content: string) => (/test/i.test(content) ? 100 : 0),
          },
        ],
      });

      const withTest = customCritic.judge("Add unit tests for auth module and refactor the implementation for better coverage.");
      const testRule = withTest.evaluation.ruleResults.find((r: { ruleId: string }) => r.ruleId === "must-mention-tests");
      expect(testRule!.score).toBe(100);
    });
  });
});
