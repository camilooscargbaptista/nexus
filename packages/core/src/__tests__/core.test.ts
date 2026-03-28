/**
 * @camilooscargbaptista/nexus-core — Integration tests for Sprint 1
 *
 * Tests covering:
 * - LLM Abstraction Layer (MockProvider)
 * - Orchestrator (topological sort, dependencies, pipeline)
 * - ReAct Agent (think/act/observe loop)
 * - ToolGateway (registration, validation, execution)
 * - Memory (short-term, long-term, hybrid)
 * - Fallback Chain (retry strategies)
 * - Integration: Orchestrator + EventBus
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { NexusEventBus } from "@camilooscargbaptista/nexus-events";
import { NexusEventType } from "@camilooscargbaptista/nexus-types";

import { MockProvider } from "../providers/mock-provider.js";
import {
  AgentOrchestrator,
  TaskStatus,
  OrchestrationError,
} from "../orchestrator.js";
import type { Agent, TaskContext, Task } from "../orchestrator.js";
import { ReActAgent, AgentState } from "../react-agent.js";
import {
  ToolGateway,
  ToolNotFoundError,
  ToolValidationError,
} from "../tool-gateway.js";
import {
  ShortTermMemory,
  LongTermMemory,
  HybridMemory,
  cosineSimilarity,
} from "../memory.js";
import {
  FallbackChain,
  FallbackChainError,
  RetryStrategy,
} from "../fallback.js";

// ═══════════════════════════════════════════════════════════════
// LLM PROVIDER — MockProvider
// ═══════════════════════════════════════════════════════════════

describe("MockProvider", () => {
  it("should return sequential responses", async () => {
    const provider = new MockProvider({ responses: ["alpha", "beta", "gamma"] });

    const r1 = await provider.chat([{ role: "user", content: "test" }]);
    const r2 = await provider.chat([{ role: "user", content: "test" }]);
    const r3 = await provider.chat([{ role: "user", content: "test" }]);

    expect(r1.content).toBe("alpha");
    expect(r2.content).toBe("beta");
    expect(r3.content).toBe("gamma");
    expect(r1.finishReason).toBe("stop");
  });

  it("should cycle responses when exhausted", async () => {
    const provider = new MockProvider({ responses: ["A", "B"] });

    await provider.chat([{ role: "user", content: "1" }]);
    await provider.chat([{ role: "user", content: "2" }]);
    const r3 = await provider.chat([{ role: "user", content: "3" }]);

    expect(r3.content).toBe("A"); // Cycles back
  });

  it("should match patterns", async () => {
    const provider = new MockProvider({
      patterns: {
        "analyze": "Architecture analysis complete",
        "validate": "Validation passed",
      },
    });

    const r1 = await provider.chat([{ role: "user", content: "please analyze this" }]);
    const r2 = await provider.chat([{ role: "user", content: "validate my code" }]);

    expect(r1.content).toBe("Architecture analysis complete");
    expect(r2.content).toBe("Validation passed");
  });

  it("should return tool calls when pattern matches", async () => {
    const provider = new MockProvider({
      toolCallPatterns: {
        "search": [{ id: "tc1", name: "search_code", arguments: { query: "test" } }],
      },
    });

    const response = await provider.chat([{ role: "user", content: "search for bugs" }]);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]!.name).toBe("search_code");
    expect(response.finishReason).toBe("tool_use");
  });

  it("should track call history", async () => {
    const provider = new MockProvider();
    await provider.chat([{ role: "user", content: "hello" }]);
    await provider.embed("test text");

    expect(provider.totalCalls).toBe(2);
    expect(provider.callHistory[0]!.method).toBe("chat");
    expect(provider.callHistory[1]!.method).toBe("embed");
  });

  it("should simulate failures", async () => {
    const provider = new MockProvider({ failCount: 2, responses: ["success"] });

    await expect(provider.chat([{ role: "user", content: "1" }])).rejects.toThrow("Mock failure");
    await expect(provider.chat([{ role: "user", content: "2" }])).rejects.toThrow("Mock failure");
    const r3 = await provider.chat([{ role: "user", content: "3" }]);
    expect(r3.content).toBe("success");
  });

  it("should generate deterministic embeddings", async () => {
    const provider = new MockProvider();
    const e1 = await provider.embed("hello world");
    const e2 = await provider.embed("hello world");
    const e3 = await provider.embed("different text");

    expect(e1.embedding).toEqual(e2.embedding);
    expect(e1.embedding).not.toEqual(e3.embedding);
    expect(e1.embedding.length).toBe(384);
  });

  it("should stream word by word", async () => {
    const provider = new MockProvider({ responses: ["hello world test"] });
    const chunks: string[] = [];

    for await (const chunk of provider.stream([{ role: "user", content: "x" }])) {
      if (chunk.type === "text" && chunk.content) chunks.push(chunk.content.trim());
    }

    expect(chunks).toEqual(["hello", "world", "test"]);
  });

  it("should pass health check", async () => {
    const provider = new MockProvider();
    expect(await provider.healthCheck()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// TOOL GATEWAY
// ═══════════════════════════════════════════════════════════════

describe("ToolGateway", () => {
  let gateway: ToolGateway;

  beforeEach(() => {
    gateway = new ToolGateway();
  });

  it("should register and list tools", () => {
    gateway.registerTool("calc", "Calculator", (inputs) => {
      const a = inputs.a as number;
      const b = inputs.b as number;
      return a + b;
    });

    const tools = gateway.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("calc");
  });

  it("should execute tools and record history", async () => {
    gateway.registerTool("multiply", "Multiply two numbers", (inputs) => {
      return (inputs.a as number) * (inputs.b as number);
    });

    const result = await gateway.executeTool("multiply", { a: 3, b: 7 });
    expect(result).toBe(21);

    const history = gateway.getExecutionHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe("success");
    expect(history[0]!.result).toBe(21);
  });

  it("should throw ToolNotFoundError for unknown tools", async () => {
    await expect(gateway.executeTool("nonexistent")).rejects.toThrow(ToolNotFoundError);
  });

  it("should validate required inputs", async () => {
    gateway.registerTool(
      "greet",
      "Greet someone",
      (inputs) => `Hello ${inputs.name}`,
      { required: ["name"] },
    );

    await expect(gateway.executeTool("greet", {})).rejects.toThrow(ToolValidationError);
    const result = await gateway.executeTool("greet", { name: "Camilo" });
    expect(result).toBe("Hello Camilo");
  });

  it("should handle async tool functions", async () => {
    gateway.registerTool("async_fetch", "Async fetch", async (inputs) => {
      return { data: inputs.url, status: 200 };
    });

    const result = await gateway.executeTool("async_fetch", { url: "https://api.example.com" });
    expect(result).toEqual({ data: "https://api.example.com", status: 200 });
  });

  it("should record errors in history", async () => {
    gateway.registerTool("fail", "Always fails", () => {
      throw new Error("Boom!");
    });

    await expect(gateway.executeTool("fail")).rejects.toThrow("Boom!");

    const history = gateway.getExecutionHistory();
    expect(history[0]!.status).toBe("error");
    expect(history[0]!.error).toContain("Boom!");
  });
});

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

describe("AgentOrchestrator", () => {
  let orchestrator: AgentOrchestrator;

  const createMockAgent = (agentType: string, result: unknown): Agent => ({
    name: `${agentType}-agent`,
    agentType,
    execute: async () => result,
    capabilities: [],
  });

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
  });

  it("should register agents and add tasks", () => {
    orchestrator.registerAgent(createMockAgent("analyzer", "done"));
    orchestrator.addTask("t1", "Analyze code", "analyzer");

    expect(orchestrator.getTask("t1")?.status).toBe(TaskStatus.PENDING);
    expect(orchestrator.getAgent("analyzer")?.name).toBe("analyzer-agent");
  });

  it("should execute single task", async () => {
    orchestrator.registerAgent(createMockAgent("analyzer", { score: 85 }));
    orchestrator.addTask("t1", "Analyze", "analyzer");

    const result = await orchestrator.executeTask("t1");
    expect(result).toEqual({ score: 85 });
    expect(orchestrator.getTaskStatus("t1")).toBe(TaskStatus.COMPLETED);
  });

  it("should execute pipeline in topological order", async () => {
    const order: string[] = [];
    const makeAgent = (type: string): Agent => ({
      name: type,
      agentType: type,
      execute: async (task: Task) => {
        order.push(task.taskId);
        return `${task.taskId}_result`;
      },
      capabilities: [],
    });

    orchestrator.registerAgent(makeAgent("perception"));
    orchestrator.registerAgent(makeAgent("reasoning"));
    orchestrator.registerAgent(makeAgent("validation"));

    orchestrator.addTask("perceive", "Analyze", "perception");
    orchestrator.addTask("reason", "Route skills", "reasoning", ["perceive"]);
    orchestrator.addTask("validate", "Validate", "validation", ["reason"]);

    const results = await orchestrator.executePipeline();

    expect(order).toEqual(["perceive", "reason", "validate"]);
    expect(results.get("validate")).toBe("validate_result");
  });

  it("should pass dependency results to tasks", async () => {
    let capturedContext: TaskContext | undefined;

    orchestrator.registerAgent({
      name: "step1",
      agentType: "step1",
      execute: async () => ({ value: 42 }),
      capabilities: [],
    });
    orchestrator.registerAgent({
      name: "step2",
      agentType: "step2",
      execute: async (_task: Task, ctx: TaskContext) => {
        capturedContext = ctx;
        return "done";
      },
      capabilities: [],
    });

    orchestrator.addTask("t1", "First", "step1");
    orchestrator.addTask("t2", "Second", "step2", ["t1"]);

    await orchestrator.executePipeline();

    expect(capturedContext?.dependencyResults["dep_t1"]).toEqual({ value: 42 });
  });

  it("should detect circular dependencies", () => {
    orchestrator.registerAgent(createMockAgent("x", null));
    orchestrator.addTask("a", "A", "x");
    orchestrator.addTask("b", "B", "x", ["a"]);

    // Manually create circular dependency
    orchestrator.getTask("a")!.dependencies.push("b");

    expect(() => orchestrator.topologicalSort()).toThrow("Circular dependency");
  });

  it("should skip tasks when dependency fails", async () => {
    orchestrator.registerAgent({
      name: "fail",
      agentType: "fail",
      execute: async () => { throw new Error("Failed!"); },
      capabilities: [],
    });
    orchestrator.registerAgent(createMockAgent("skip", "nope"));

    orchestrator.addTask("t1", "Will fail", "fail");
    orchestrator.addTask("t2", "Will skip", "skip", ["t1"]);

    await orchestrator.executePipeline();

    expect(orchestrator.getTaskStatus("t1")).toBe(TaskStatus.FAILED);
    expect(orchestrator.getTaskStatus("t2")).toBe(TaskStatus.SKIPPED);
  });

  it("should fail when no agent found for task type", async () => {
    orchestrator.addTask("t1", "No agent", "nonexistent");
    await expect(orchestrator.executeTask("t1")).rejects.toThrow("No agent found");
  });

  it("should aggregate results", async () => {
    orchestrator.registerAgent(createMockAgent("a", 1));
    orchestrator.registerAgent(createMockAgent("b", 2));

    orchestrator.addTask("t1", "One", "a");
    orchestrator.addTask("t2", "Two", "b");

    await orchestrator.executePipeline();

    const agg = orchestrator.aggregateResults();
    expect(agg).toEqual({ t1: 1, t2: 2 });
  });

  it("should reset all tasks", async () => {
    orchestrator.registerAgent(createMockAgent("x", "ok"));
    orchestrator.addTask("t1", "Test", "x");
    await orchestrator.executePipeline();

    expect(orchestrator.getTaskStatus("t1")).toBe(TaskStatus.COMPLETED);
    orchestrator.reset();
    expect(orchestrator.getTaskStatus("t1")).toBe(TaskStatus.PENDING);
  });
});

// ═══════════════════════════════════════════════════════════════
// REACT AGENT
// ═══════════════════════════════════════════════════════════════

describe("ReActAgent", () => {
  it("should resolve with final answer", async () => {
    const provider = new MockProvider({
      responses: ["FINAL ANSWER: The answer is 42"],
    });

    const agent = new ReActAgent(provider);
    const result = await agent.run("What is the answer?");

    expect(result).toBe("The answer is 42");
    expect(agent.currentState).toBe(AgentState.DONE);
  });

  it("should use tools via gateway", async () => {
    const provider = new MockProvider({
      responses: [
        "I need to calculate. TOOL: calculator | INPUTS: {\"a\": 5, \"b\": 3}",
        "FINAL ANSWER: The sum is 8",
      ],
    });

    const gateway = new ToolGateway();
    gateway.registerTool("calculator", "Add numbers", (inputs) => {
      return (inputs.a as number) + (inputs.b as number);
    });

    const agent = new ReActAgent(provider, gateway);
    const result = await agent.run("Calculate 5 + 3");

    expect(result).toBe("The sum is 8");

    const history = agent.getHistory();
    expect(history.actions).toHaveLength(1);
    expect(history.actions[0]!.toolName).toBe("calculator");
    expect(history.observations).toHaveLength(1);
    expect(history.observations[0]!.result).toBe(8);
    expect(history.observations[0]!.success).toBe(true);
  });

  it("should handle missing tools gracefully", async () => {
    const provider = new MockProvider({
      responses: [
        "TOOL: nonexistent | INPUTS: {}",
        "FINAL ANSWER: Could not find tool",
      ],
    });

    const gateway = new ToolGateway();
    const agent = new ReActAgent(provider, gateway);
    const result = await agent.run("Use unknown tool");

    expect(result).toBe("Could not find tool");
    const history = agent.getHistory();
    expect(history.observations[0]!.success).toBe(false);
  });

  it("should respect max iterations", async () => {
    const provider = new MockProvider({
      responses: ["Still thinking..."], // Never produces FINAL ANSWER
    });

    const agent = new ReActAgent(provider, undefined, { maxIterations: 3 });
    const result = await agent.run("Infinite loop task");

    expect(agent.getHistory().iterations).toBe(3);
    expect(result).toBe("Still thinking...");
  });

  it("should work in single action mode", async () => {
    const provider = new MockProvider({
      responses: ["TOOL: fetch | INPUTS: {\"url\": \"api.com\"}"],
    });

    const gateway = new ToolGateway();
    gateway.registerTool("fetch", "Fetch URL", () => ({ status: 200, body: "ok" }));

    const agent = new ReActAgent(provider, gateway, { singleAction: true });
    const result = await agent.run("Fetch data");

    expect(JSON.parse(result)).toEqual({ status: 200, body: "ok" });
    expect(agent.getHistory().iterations).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// MEMORY
// ═══════════════════════════════════════════════════════════════

describe("Memory", () => {
  describe("ShortTermMemory", () => {
    it("should add and retrieve entries", () => {
      const mem = new ShortTermMemory(5);
      mem.addMessage("user", "Hello");
      mem.addMessage("assistant", "Hi there");

      expect(mem.size()).toBe(2);
      expect(mem.retrieve(undefined, 2)).toHaveLength(2);
    });

    it("should evict old entries (FIFO)", () => {
      const mem = new ShortTermMemory(2); // 2 turns = 4 entries max

      for (let i = 0; i < 6; i++) {
        mem.addMessage("user", `msg ${i}`);
      }

      expect(mem.size()).toBe(4);
      expect(mem.all[0]!.content).toBe("msg 2"); // First 2 evicted
    });

    it("should return context as role-content pairs", () => {
      const mem = new ShortTermMemory();
      mem.addMessage("user", "What is 2+2?");
      mem.addMessage("assistant", "4");

      const ctx = mem.getContext(1);
      expect(ctx).toEqual([
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
      ]);
    });
  });

  describe("LongTermMemory", () => {
    it("should store and search with similarity", async () => {
      const provider = new MockProvider();
      const mem = new LongTermMemory(provider);

      await mem.store("TypeScript is great for type safety");
      await mem.store("Python is excellent for data science");
      await mem.store("TypeScript and JavaScript share syntax");

      const results = await mem.search("TypeScript programming", 2);
      expect(results).toHaveLength(2);
      // Each result is [content, score]
      expect(results[0]![0]).toBeDefined();
      expect(typeof results[0]![1]).toBe("number");
    });

    it("should work without provider (hash-based)", async () => {
      const mem = new LongTermMemory(); // No provider
      await mem.store("Hello world");
      await mem.store("Goodbye world");

      const results = await mem.retrieve("Hello", 1);
      expect(results).toHaveLength(1);
    });
  });

  describe("HybridMemory", () => {
    it("should add to short-term and optionally persist to long-term", async () => {
      const hybrid = new HybridMemory(5);

      await hybrid.addInteraction("user", "Quick question", false);
      await hybrid.addInteraction("assistant", "Quick answer", false);
      await hybrid.addInteraction("user", "Important insight", true); // Persist

      expect(hybrid.shortTerm.size()).toBe(3);
      expect(hybrid.longTerm.size()).toBe(1);
    });

    it("should search long-term knowledge", async () => {
      const provider = new MockProvider();
      const hybrid = new HybridMemory(5, provider);

      await hybrid.addInteraction("user", "Architecture patterns are key", true);
      await hybrid.addInteraction("user", "Security is non-negotiable", true);

      const results = await hybrid.searchKnowledge("patterns");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("cosineSimilarity", () => {
    it("should return 1 for identical vectors", () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    });

    it("should return 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("should handle empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// FALLBACK CHAIN
// ═══════════════════════════════════════════════════════════════

describe("FallbackChain", () => {
  it("should return first successful result", async () => {
    const chain = new FallbackChain<string>();
    chain
      .addStep(() => { throw new Error("Step 1 fails"); }, { description: "Primary", maxRetries: 0 })
      .addStep(() => "fallback works", { description: "Fallback", maxRetries: 0 });

    const result = await chain.execute();
    expect(result).toBe("fallback works");
  });

  it("should retry with exponential backoff", async () => {
    let attempts = 0;
    const chain = new FallbackChain<string>();
    chain.addStep(
      () => {
        attempts++;
        if (attempts < 3) throw new Error("Not yet");
        return "ok";
      },
      {
        description: "Retryable",
        maxRetries: 3,
        retryStrategy: RetryStrategy.EXPONENTIAL_BACKOFF,
        initialDelay: 10, // Short for tests
      },
    );

    const result = await chain.execute();
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("should throw FallbackChainError when all steps fail", async () => {
    const chain = new FallbackChain();
    chain
      .addStep(() => { throw new Error("A"); }, { maxRetries: 0 })
      .addStep(() => { throw new Error("B"); }, { maxRetries: 0 });

    await expect(chain.execute()).rejects.toThrow(FallbackChainError);

    try {
      await chain.execute();
    } catch (err) {
      if (err instanceof FallbackChainError) {
        expect(err.records).toHaveLength(2);
      }
    }
  });

  it("should record execution history", async () => {
    const chain = new FallbackChain<number>();
    chain.addStep(() => 42, { description: "Answer", maxRetries: 0 });

    await chain.execute();

    const history = chain.getExecutionHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe("success");
    expect(history[0]!.result).toBe(42);
  });

  it("should support immediate retry strategy", async () => {
    let calls = 0;
    const chain = new FallbackChain<string>();
    chain.addStep(
      () => {
        calls++;
        if (calls < 2) throw new Error("once");
        return "done";
      },
      { maxRetries: 2, retryStrategy: RetryStrategy.IMMEDIATE },
    );

    const start = Date.now();
    await chain.execute();
    const elapsed = Date.now() - start;

    expect(calls).toBe(2);
    expect(elapsed).toBeLessThan(100); // No delays
  });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION: Orchestrator + EventBus
// ═══════════════════════════════════════════════════════════════

describe("Orchestrator + EventBus Integration", () => {
  it("should emit events during pipeline execution", async () => {
    const eventBus = new NexusEventBus();
    const correlationId = "test-pipeline-001";
    const orchestrator = new AgentOrchestrator(eventBus, correlationId);
    const receivedEvents: string[] = [];

    eventBus.on(NexusEventType.PIPELINE_STARTED, (event) => {
      receivedEvents.push(`started:${(event.payload as Record<string,string>).taskId}`);
    });
    eventBus.on(NexusEventType.PIPELINE_COMPLETED, (event) => {
      receivedEvents.push(`completed:${(event.payload as Record<string,string>).taskId}`);
    });

    orchestrator.registerAgent({
      name: "worker",
      agentType: "worker",
      execute: async () => "result",
      capabilities: [],
    });

    orchestrator.addTask("t1", "Do work", "worker");
    orchestrator.addTask("t2", "More work", "worker", ["t1"]);

    await orchestrator.executePipeline();

    expect(receivedEvents).toContain("started:t1");
    expect(receivedEvents).toContain("completed:t1");
    expect(receivedEvents).toContain("started:t2");
    expect(receivedEvents).toContain("completed:t2");
  });

  it("should link events via correlationId", async () => {
    const eventBus = new NexusEventBus();
    const correlationId = "correlation-test";
    const orchestrator = new AgentOrchestrator(eventBus, correlationId);

    orchestrator.registerAgent({
      name: "agent",
      agentType: "agent",
      execute: async () => 42,
      capabilities: [],
    });

    orchestrator.addTask("t1", "Task", "agent");
    await orchestrator.executePipeline();

    const pipelineEvents = eventBus.getPipelineEvents(correlationId);
    expect(pipelineEvents.length).toBeGreaterThanOrEqual(2); // started + completed
    expect(pipelineEvents.every((e) => e.correlationId === correlationId)).toBe(true);
  });

  it("should emit error events on task failure", async () => {
    const eventBus = new NexusEventBus();
    const orchestrator = new AgentOrchestrator(eventBus);
    let errorEmitted = false;

    eventBus.on(NexusEventType.ERROR_OCCURRED, () => {
      errorEmitted = true;
    });

    orchestrator.registerAgent({
      name: "fail",
      agentType: "fail",
      execute: async () => { throw new Error("kaboom"); },
      capabilities: [],
    });

    orchestrator.addTask("t1", "Will fail", "fail");
    await orchestrator.executePipeline();

    expect(errorEmitted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION: Full Pipeline (Orchestrator + ReAct + Tools)
// ═══════════════════════════════════════════════════════════════

describe("Full Pipeline Integration", () => {
  it("should orchestrate agents that use ReAct + Tools", async () => {
    const eventBus = new NexusEventBus();
    const orchestrator = new AgentOrchestrator(eventBus, "full-pipeline-test");

    // Agent that uses ReAct internally
    const analyzerAgent: Agent = {
      name: "analyzer",
      agentType: "analyzer",
      execute: async () => {
        const provider = new MockProvider({
          responses: ["FINAL ANSWER: Score is 85/100"],
        });
        const agent = new ReActAgent(provider);
        return agent.run("Analyze the codebase");
      },
      capabilities: ["analysis"],
    };

    // Agent that receives dependency result
    const validatorAgent: Agent = {
      name: "validator",
      agentType: "validator",
      execute: async (_task: Task, ctx: TaskContext) => {
        const analysisResult = ctx.dependencyResults["dep_analyze"] as string;
        return { validated: true, source: analysisResult };
      },
      capabilities: ["validation"],
    };

    orchestrator.registerAgent(analyzerAgent);
    orchestrator.registerAgent(validatorAgent);

    orchestrator.addTask("analyze", "Analyze code", "analyzer");
    orchestrator.addTask("validate", "Validate findings", "validator", ["analyze"]);

    const results = await orchestrator.executePipeline();

    const validateResult = results.get("validate") as { validated: boolean; source: string };
    expect(validateResult.validated).toBe(true);
    expect(validateResult.source).toContain("Score is 85/100");
  });
});
