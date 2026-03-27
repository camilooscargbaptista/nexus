/**
 * @nexus/core — Context Window Manager Tests
 */

import { describe, it, expect } from "@jest/globals";
import { TokenEstimator } from "../token-estimator.js";
import { ContextPrioritizer } from "../context-prioritizer.js";
import { ContextWindowManager } from "../context-window.js";
import type { ContextChunk } from "../context-prioritizer.js";

// ═══════════════════════════════════════════════════════════════
// TOKEN ESTIMATOR
// ═══════════════════════════════════════════════════════════════

describe("TokenEstimator", () => {
  it("should estimate text tokens", () => {
    const result = TokenEstimator.estimate("Hello, world! This is a test.");
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.characters).toBe(29);
    expect(result.method).toBe("heuristic");
  });

  it("should estimate code with higher multiplier", () => {
    const text = "const x = 1;";
    const textEstimate = TokenEstimator.estimate(text, false);
    const codeEstimate = TokenEstimator.estimate(text, true);

    expect(codeEstimate.tokens).toBeGreaterThan(textEstimate.tokens);
  });

  it("should return zero for empty string", () => {
    const result = TokenEstimator.estimate("");
    expect(result.tokens).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it("should estimate many texts combined", () => {
    const result = TokenEstimator.estimateMany(["Hello", "World", "Test"]);
    expect(result.tokens).toBeGreaterThan(0);
  });

  it("should get model limits", () => {
    const limits = TokenEstimator.getModelLimits("claude-3.5-sonnet");
    expect(limits.maxTokens).toBe(200000);
    expect(limits.outputReserve).toBe(8192);
    expect(limits.availableInput).toBe(191808);
  });

  it("should return defaults for unknown model", () => {
    const limits = TokenEstimator.getModelLimits("unknown-model");
    expect(limits.maxTokens).toBe(8192);
  });

  it("should check if text fits model", () => {
    const short = TokenEstimator.fits("Hello", "claude-3.5-sonnet");
    expect(short.fits).toBe(true);
    expect(short.overflow).toBe(0);
  });

  it("should detect overflow for tiny model", () => {
    const longText = "x".repeat(100000);
    const result = TokenEstimator.fits(longText, "gpt-4");
    expect(result.fits).toBe(false);
    expect(result.overflow).toBeGreaterThan(0);
  });

  it("should list available models", () => {
    const models = TokenEstimator.availableModels;
    expect(models).toContain("claude-3.5-sonnet");
    expect(models).toContain("gpt-4o");
    expect(models.length).toBeGreaterThanOrEqual(8);
  });
});

// ═══════════════════════════════════════════════════════════════
// CONTEXT PRIORITIZER
// ═══════════════════════════════════════════════════════════════

describe("ContextPrioritizer", () => {
  const prioritizer = new ContextPrioritizer({ model: "claude-3.5-sonnet" });

  it("should select all chunks when budget allows", () => {
    const chunks: ContextChunk[] = [
      { id: "a", content: "short text", priority: 1, type: "system" },
      { id: "b", content: "another text", priority: 2, type: "user" },
    ];

    const window = prioritizer.build(chunks);
    expect(window.selected.length).toBe(2);
    expect(window.dropped.length).toBe(0);
  });

  it("should drop low-priority chunks when over budget", () => {
    const tinyPrioritizer = new ContextPrioritizer({ model: "gpt-4", safetyMargin: 5000 });

    const big = "x".repeat(20000); // lots of tokens
    const chunks: ContextChunk[] = [
      { id: "important", content: "critical", priority: 1, type: "system" },
      { id: "big-doc", content: big, priority: 10, type: "document" },
    ];

    const window = tinyPrioritizer.build(chunks);
    expect(window.selected.some((c) => c.id === "important")).toBe(true);
  });

  it("should order by priority", () => {
    const chunks: ContextChunk[] = [
      { id: "low", content: "low", priority: 10, type: "document" },
      { id: "high", content: "high", priority: 1, type: "system" },
      { id: "mid", content: "mid", priority: 5, type: "user" },
    ];

    const window = prioritizer.build(chunks);
    expect(window.selected[0]!.id).toBe("high");
  });

  it("should support type priority overrides", () => {
    const overridden = new ContextPrioritizer({
      model: "claude-3.5-sonnet",
      typePriorities: { "tool-result": 0 }, // highest
    });

    const chunks: ContextChunk[] = [
      { id: "sys", content: "system", priority: 5, type: "system" },
      { id: "tool", content: "tool result", priority: 99, type: "tool-result" },
    ];

    const window = overridden.build(chunks);
    expect(window.selected[0]!.id).toBe("tool"); // overridden to priority 0
  });

  it("should calculate remaining budget", () => {
    const remaining = prioritizer.remainingBudget(1000);
    expect(remaining).toBeGreaterThan(0);
  });

  it("should report usage percent", () => {
    const chunks: ContextChunk[] = [
      { id: "a", content: "Hello world", priority: 1, type: "system" },
    ];

    const window = prioritizer.build(chunks);
    expect(window.usagePercent).toBeGreaterThanOrEqual(0);
    expect(window.usagePercent).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// CONTEXT WINDOW MANAGER
// ═══════════════════════════════════════════════════════════════

describe("ContextWindowManager", () => {
  it("should assemble prompt with system + user", () => {
    const manager = new ContextWindowManager({
      model: "claude-3.5-sonnet",
      systemPrompt: "You are Nexus.",
    });

    const prompt = manager.assemble("Analyze the auth module");

    expect(prompt.system).toBe("You are Nexus.");
    expect(prompt.userQuery).toBe("Analyze the auth module");
    expect(prompt.totalTokens).toBeGreaterThan(0);
  });

  it("should include documents in context", () => {
    const manager = new ContextWindowManager({
      model: "claude-3.5-sonnet",
      systemPrompt: "System",
    });

    manager.addDocument("doc1", "Architecture overview of the system");
    manager.addDocument("doc2", "Security analysis report");

    const prompt = manager.assemble("Review architecture");
    expect(prompt.contextMessages.length).toBe(2);
  });

  it("should include code with correct detection", () => {
    const manager = new ContextWindowManager({
      model: "claude-3.5-sonnet",
      systemPrompt: "System",
    });

    manager.addCode("src", "const x = 1;\nfunction foo() { return x; }", 2);
    expect(manager.chunkCount).toBe(1);
  });

  it("should add history and tool results", () => {
    const manager = new ContextWindowManager({
      model: "claude-3.5-sonnet",
      systemPrompt: "S",
    });

    manager.addHistory("Previous conversation...");
    manager.addToolResult("tool1", "{ score: 85 }");

    expect(manager.chunkCount).toBe(2);
  });

  it("should clear all chunks", () => {
    const manager = new ContextWindowManager({ model: "claude-3.5-sonnet", systemPrompt: "S" });

    manager.addDocument("d1", "text");
    manager.addHistory("history");
    manager.clear();

    expect(manager.chunkCount).toBe(0);
  });

  it("should report status", () => {
    const manager = new ContextWindowManager({ model: "claude-3.5-sonnet", systemPrompt: "S" });

    manager.addDocument("d1", "Some text content");
    const status = manager.getStatus();

    expect(status.model).toBe("claude-3.5-sonnet");
    expect(status.chunkCount).toBe(1);
    expect(status.estimatedTokens).toBeGreaterThan(0);
  });

  it("should detect code heuristically in addDocument", () => {
    const manager = new ContextWindowManager({ model: "claude-3.5-sonnet", systemPrompt: "S" });

    manager.addDocument("auto", "import { x } from 'y';\nconst fn = () => { return x; }; class Foo {}");
    const prompt = manager.assemble("test");

    expect(prompt.totalTokens).toBeGreaterThan(0);
  });
});
