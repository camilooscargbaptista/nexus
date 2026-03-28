/**
 * @camilooscargbaptista/nexus-bridge — BM25 Search Tests
 */

import { describe, it, expect } from "@jest/globals";
import { tokenize, BM25Index, SkillSearchEngine } from "../bm25-search.js";

describe("Tokenizer", () => {
  it("should lowercase and split text", () => {
    const tokens = tokenize("Security Vulnerability ANALYSIS");
    expect(tokens).toContain("security");
    expect(tokens).toContain("vulnerability");
    expect(tokens).toContain("analysis");
  });

  it("should remove stopwords", () => {
    const tokens = tokenize("the security of the application is important");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("of");
    expect(tokens).not.toContain("is");
    expect(tokens).toContain("security");
    expect(tokens).toContain("application");
    expect(tokens).toContain("important");
  });

  it("should remove punctuation", () => {
    const tokens = tokenize("sql_injection, xss! code-review.");
    expect(tokens).toContain("sql_injection");
    expect(tokens).toContain("xss");
    expect(tokens).toContain("code-review");
  });

  it("should filter single-char tokens", () => {
    const tokens = tokenize("a b c test");
    expect(tokens).toEqual(["test"]);
  });
});

describe("BM25Index", () => {
  it("should add documents and build index", () => {
    const index = new BM25Index();
    index.addDocument("doc1", "security vulnerability analysis");
    index.addDocument("doc2", "performance optimization profiling");
    index.buildIndex();

    expect(index.size).toBe(2);
    expect(index.isBuilt).toBe(true);
  });

  it("should return relevant results", () => {
    const index = new BM25Index();
    index.addDocument("sec", "security vulnerability audit penetration testing");
    index.addDocument("perf", "performance optimization latency throughput");
    index.addDocument("db", "database query optimization index schema");
    index.buildIndex();

    const results = index.search("security audit");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe("sec");
  });

  it("should rank by relevance", () => {
    const index = new BM25Index();
    index.addDocument("a", "database schema design normalization");
    index.addDocument("b", "database query optimization database index performance");
    index.addDocument("c", "frontend react component design");
    index.buildIndex();

    const results = index.search("database optimization");
    expect(results[0]!.id).toBe("b"); // More relevant (has both terms + repeated "database")
  });

  it("should return empty for empty corpus", () => {
    const index = new BM25Index();
    index.buildIndex();
    expect(index.search("anything")).toEqual([]);
  });

  it("should return empty for stopword-only query", () => {
    const index = new BM25Index();
    index.addDocument("doc1", "some content here");
    index.buildIndex();
    expect(index.search("the and or")).toEqual([]);
  });

  it("should auto-build on search if not built", () => {
    const index = new BM25Index();
    index.addDocument("doc1", "testing framework jest");
    // Not calling buildIndex() explicitly
    const results = index.search("jest testing");
    expect(results.length).toBe(1);
  });

  it("should respect topK parameter", () => {
    const index = new BM25Index();
    for (let i = 0; i < 20; i++) {
      index.addDocument(`doc${i}`, `testing code quality review test${i}`);
    }
    index.buildIndex();

    const results = index.search("testing", 3);
    expect(results.length).toBe(3);
  });

  it("should support custom k1 and b parameters", () => {
    const index = new BM25Index({ k1: 2.0, b: 0.5 });
    index.addDocument("doc1", "security vulnerability analysis");
    index.buildIndex();

    const results = index.search("security");
    expect(results.length).toBe(1);
  });
});

describe("SkillSearchEngine", () => {
  const skills = [
    { name: "security-review", description: "Comprehensive security vulnerability analysis", tags: ["security", "owasp"], category: "security" },
    { name: "performance-profiling", description: "Performance bottleneck detection and optimization", tags: ["performance", "latency"], category: "performance" },
    { name: "database-review", description: "Database schema query optimization and migration", tags: ["database", "sql"], category: "database" },
    { name: "testing-strategy", description: "Test coverage analysis and testing recommendations", tags: ["testing", "coverage"], category: "quality" },
  ];

  it("should index and search skills", () => {
    const engine = new SkillSearchEngine();
    engine.indexSkills(skills);

    const results = engine.search("security vulnerability");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.skillName).toBe("security-review");
  });

  it("should match by tags", () => {
    const engine = new SkillSearchEngine();
    engine.indexSkills(skills);

    const results = engine.search("owasp");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.skillName).toBe("security-review");
  });

  it("should match by category", () => {
    const engine = new SkillSearchEngine();
    engine.indexSkills(skills);

    const results = engine.search("database sql");
    expect(results[0]!.skillName).toBe("database-review");
  });

  it("should report size", () => {
    const engine = new SkillSearchEngine();
    engine.indexSkills(skills);
    expect(engine.size).toBe(4);
  });
});
