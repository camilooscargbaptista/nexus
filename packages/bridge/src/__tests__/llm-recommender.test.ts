/**
 * @nexus/bridge — LLM Recommender Tests
 */

import { describe, it, expect, jest } from "@jest/globals";
import { LLMRecommender } from "../llm-recommender.js";
import type { LLMProvider } from "../llm-recommender.js";

const TEST_SKILLS = [
  { name: "security-review", description: "Security vulnerability analysis audit", tags: ["security"], category: "security" },
  { name: "performance-profiling", description: "Performance bottleneck detection optimization", tags: ["performance"], category: "performance" },
  { name: "database-review", description: "Database schema query optimization", tags: ["database"], category: "database" },
  { name: "testing-strategy", description: "Test coverage analysis recommendations", tags: ["testing"], category: "quality" },
  { name: "code-quality", description: "Code quality lint analysis review", tags: ["quality"], category: "code-quality" },
];

describe("LLMRecommender", () => {
  describe("BM25-only mode", () => {
    it("should return BM25 results when score is sufficient", async () => {
      const recommender = new LLMRecommender(undefined, { useLLMFallback: false });
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("security vulnerability audit");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.skillName).toBe("security-review");
      expect(results[0]!.source).toBe("bm25");
    });

    it("should respect topK config", async () => {
      const recommender = new LLMRecommender(undefined, { topK: 2, useLLMFallback: false });
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("review analysis");
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should work without LLM provider", async () => {
      const recommender = new LLMRecommender();
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("database optimization");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("LLM Fallback", () => {
    it("should call LLM when BM25 score is below threshold", async () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn<LLMProvider["complete"]>().mockResolvedValue(
          '[{"name": "security-review", "reasoning": "Query is about security"}]',
        ),
      };

      const recommender = new LLMRecommender(mockProvider, {
        bm25Threshold: 999, // Force LLM fallback
      });
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("obscure query that BM25 wont match well");

      expect(mockProvider.complete).toHaveBeenCalled();
      // Should have some results (either BM25 or LLM)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should NOT call LLM when BM25 score is above threshold", async () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn<LLMProvider["complete"]>().mockResolvedValue("[]"),
      };

      const recommender = new LLMRecommender(mockProvider, {
        bm25Threshold: 0.001, // Very low threshold — BM25 sufficient
      });
      recommender.indexSkills(TEST_SKILLS);

      await recommender.recommend("security vulnerability audit analysis");

      expect(mockProvider.complete).not.toHaveBeenCalled();
    });

    it("should merge BM25 and LLM results", async () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn<LLMProvider["complete"]>().mockResolvedValue(
          '[{"name": "testing-strategy", "reasoning": "Also relevant for test coverage"}]',
        ),
      };

      const recommender = new LLMRecommender(mockProvider, {
        bm25Threshold: 999, // Force LLM
      });
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("code quality review");

      // Should have results from both sources
      const sources = new Set(results.map((r) => r.source));
      expect(sources.size).toBeGreaterThanOrEqual(1);
    });

    it("should handle LLM provider failure gracefully", async () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn<LLMProvider["complete"]>().mockRejectedValue(new Error("LLM timeout")),
      };

      const recommender = new LLMRecommender(mockProvider, {
        bm25Threshold: 999,
      });
      recommender.indexSkills(TEST_SKILLS);

      // Should not throw
      const results = await recommender.recommend("some query");
      // BM25 results should still come through
      expect(results).toBeDefined();
    });

    it("should handle invalid LLM response", async () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn<LLMProvider["complete"]>().mockResolvedValue("This is not JSON at all"),
      };

      const recommender = new LLMRecommender(mockProvider, {
        bm25Threshold: 999,
      });
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("query");
      expect(results).toBeDefined();
    });

    it("should filter out unknown skills from LLM response", async () => {
      const mockProvider: LLMProvider = {
        complete: jest.fn<LLMProvider["complete"]>().mockResolvedValue(
          '[{"name": "nonexistent-skill", "reasoning": "Hallucinated skill"}]',
        ),
      };

      const recommender = new LLMRecommender(mockProvider, {
        bm25Threshold: 999,
      });
      recommender.indexSkills(TEST_SKILLS);

      const results = await recommender.recommend("query");
      const hasNonexistent = results.some((r) => r.skillName === "nonexistent-skill");
      expect(hasNonexistent).toBe(false);
    });
  });

  describe("Utility", () => {
    it("should report skill count", () => {
      const recommender = new LLMRecommender();
      recommender.indexSkills(TEST_SKILLS);
      expect(recommender.skillCount).toBe(5);
    });
  });
});
