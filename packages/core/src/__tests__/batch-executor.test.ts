/**
 * @nexus/core — Batch Executor Tests
 */

import { describe, it, expect, jest } from "@jest/globals";
import { BatchExecutor } from "../batch-executor.js";
import type { BatchTask, BatchTaskResult } from "../batch-executor.js";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTask(
  id: string,
  deps: string[] = [],
  result: unknown = id,
  delayMs = 0,
): BatchTask {
  return {
    id,
    dependencies: deps,
    execute: async () => {
      if (delayMs > 0) await delay(delayMs);
      return result;
    },
  };
}

function makeFailingTask(id: string, deps: string[] = []): BatchTask {
  return {
    id,
    dependencies: deps,
    execute: async () => {
      throw new Error(`Task ${id} failed`);
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("BatchExecutor", () => {
  describe("Basic Execution", () => {
    it("should execute independent tasks in parallel", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([
        makeTask("a"),
        makeTask("b"),
        makeTask("c"),
      ]);

      expect(result.completed.length).toBe(3);
      expect(result.failed.length).toBe(0);
      expect(result.skipped.length).toBe(0);
      expect(result.levels).toBe(1); // All at level 0
    });

    it("should respect dependency order", async () => {
      const order: string[] = [];
      const tasks: BatchTask[] = [
        {
          id: "a",
          dependencies: [],
          execute: async () => { order.push("a"); return "a"; },
        },
        {
          id: "b",
          dependencies: ["a"],
          execute: async () => { order.push("b"); return "b"; },
        },
        {
          id: "c",
          dependencies: ["b"],
          execute: async () => { order.push("c"); return "c"; },
        },
      ];

      const executor = new BatchExecutor();
      await executor.execute(tasks);

      expect(order).toEqual(["a", "b", "c"]);
    });

    it("should handle diamond dependencies", async () => {
      // a → b, a → c, b+c → d
      const executor = new BatchExecutor();
      const result = await executor.execute([
        makeTask("a"),
        makeTask("b", ["a"]),
        makeTask("c", ["a"]),
        makeTask("d", ["b", "c"]),
      ]);

      expect(result.completed.length).toBe(4);
      expect(result.levels).toBe(3); // Level 0: a, Level 1: b+c, Level 2: d
    });

    it("should return task results", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([
        makeTask("calc", [], 42),
      ]);

      expect(result.completed[0]!.result).toBe(42);
    });
  });

  describe("Error Handling", () => {
    it("should handle task failures", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([
        makeFailingTask("bad"),
      ]);

      expect(result.failed.length).toBe(1);
      expect(result.failed[0]!.error).toContain("Task bad failed");
    });

    it("should skip tasks when dependency fails", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([
        makeFailingTask("a"),
        makeTask("b", ["a"]),
        makeTask("c", ["b"]),
      ]);

      expect(result.failed.length).toBe(1);
      expect(result.skipped.length).toBe(2); // b + c skipped
    });

    it("should not skip independent tasks when one fails", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([
        makeFailingTask("a"),
        makeTask("b"), // No deps — should still run
      ]);

      expect(result.failed.length).toBe(1);
      expect(result.completed.length).toBe(1);
      expect(result.completed[0]!.id).toBe("b");
    });
  });

  describe("Concurrency", () => {
    it("should limit concurrency with maxConcurrency", async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks: BatchTask[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        dependencies: [],
        execute: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await delay(20);
          concurrent--;
          return i;
        },
      }));

      const executor = new BatchExecutor({ maxConcurrency: 2 });
      const result = await executor.execute(tasks);

      expect(result.completed.length).toBe(5);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe("Callbacks", () => {
    it("should call onTaskComplete", async () => {
      const completed: string[] = [];
      const executor = new BatchExecutor({
        onTaskComplete: (r: BatchTaskResult) => completed.push(r.id),
      });

      await executor.execute([makeTask("x"), makeTask("y")]);

      expect(completed).toContain("x");
      expect(completed).toContain("y");
    });

    it("should call onTaskFailed", async () => {
      const failed: string[] = [];
      const executor = new BatchExecutor({
        onTaskFailed: (r: BatchTaskResult) => failed.push(r.id),
      });

      await executor.execute([makeFailingTask("bad")]);

      expect(failed).toContain("bad");
    });
  });

  describe("Timing", () => {
    it("should track task duration", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([makeTask("slow", [], "done", 20)]);

      expect(result.completed[0]!.duration).toBeGreaterThanOrEqual(10);
    });

    it("should track total duration", async () => {
      const executor = new BatchExecutor();
      const result = await executor.execute([makeTask("t1")]);

      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });
});
