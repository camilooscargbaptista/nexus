/**
 * @camilooscargbaptista/nexus-events — Middleware Tests
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { NexusEventBus } from "../index.js";
import { withLogging, withTiming, MiddlewareChain } from "../middleware.js";
import type { ToolHandler } from "../middleware.js";

describe("Middleware", () => {
  let eventBus: NexusEventBus;

  beforeEach(() => {
    eventBus = new NexusEventBus();
  });

  describe("withLogging", () => {
    it("should emit tool.started and tool.completed on success", async () => {
      const events: unknown[] = [];
      eventBus.on("*" as any, (e: unknown) => { events.push(e); });

      const handler: ToolHandler<unknown, string> = async () => "result";
      const logged = withLogging<unknown, string>("test-tool", eventBus)(handler);

      const result = await logged({ input: "data" });

      expect(result).toBe("result");

      // Check emitted events
      const started = events.find(
        (e: any) => e.type === "tool.started",
      ) as any;
      const completed = events.find(
        (e: any) => e.type === "tool.completed",
      ) as any;

      expect(started).toBeDefined();
      expect(started.payload.toolName).toBe("test-tool");
      expect(started.payload.correlationId).toBeDefined();

      expect(completed).toBeDefined();
      expect(completed.payload.success).toBe(true);
      expect(completed.payload.duration).toBeGreaterThanOrEqual(0);
    });

    it("should emit tool.failed on error", async () => {
      const events: unknown[] = [];
      eventBus.on("*" as any, (e: unknown) => { events.push(e); });

      const handler: ToolHandler<unknown, never> = async () => {
        throw new Error("Boom");
      };
      const logged = withLogging<unknown, never>("failing-tool", eventBus)(handler);

      await expect(logged({})).rejects.toThrow("Boom");

      const failed = events.find(
        (e: any) => e.type === "tool.failed",
      ) as any;
      expect(failed).toBeDefined();
      expect(failed.payload.error).toBe("Boom");
      expect(failed.payload.toolName).toBe("failing-tool");
    });

    it("should propagate correlation ID", async () => {
      const events: unknown[] = [];
      eventBus.on("*" as any, (e: unknown) => { events.push(e); });

      const handler: ToolHandler<unknown, string> = async () => "ok";
      const logged = withLogging<unknown, string>("corr-tool", eventBus)(handler);

      await logged({});

      const started = events.find(
        (e: any) => e.type === "tool.started",
      ) as any;
      const completed = events.find(
        (e: any) => e.type === "tool.completed",
      ) as any;

      expect(started.payload.correlationId).toBe(
        completed.payload.correlationId,
      );
    });

    it("should truncate large args in logging", async () => {
      const events: unknown[] = [];
      eventBus.on("*" as any, (e: unknown) => { events.push(e); });

      const handler: ToolHandler<unknown, string> = async () => "ok";
      const logged = withLogging<unknown, string>("big-args-tool", eventBus)(handler);

      const bigString = "x".repeat(500);
      await logged({ data: bigString });

      const started = events.find(
        (e: any) => e.type === "tool.started",
      ) as any;
      // Args deve ser truncado
      expect((started.payload.args as any).data.length).toBeLessThan(500);
    });
  });

  describe("withTiming", () => {
    it("should inject _duration into result", async () => {
      const handler = async () => ({ data: "value" });
      const timed = withTiming<unknown, any>()(handler as ToolHandler<unknown, any>);

      const result = await timed({}) as any;

      expect(result.data).toBe("value");
      expect(result._duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("MiddlewareChain", () => {
    it("should compose multiple middlewares", async () => {
      const callOrder: string[] = [];

      const middleware1 = (handler: ToolHandler<any, any>): ToolHandler<any, any> =>
        async (args, ctx?) => {
          callOrder.push("m1-before");
          const r = await Promise.resolve(handler(args, ctx));
          callOrder.push("m1-after");
          return r;
        };

      const middleware2 = (handler: ToolHandler<any, any>): ToolHandler<any, any> =>
        async (args, ctx?) => {
          callOrder.push("m2-before");
          const r = await Promise.resolve(handler(args, ctx));
          callOrder.push("m2-after");
          return r;
        };

      const handler: ToolHandler<any, string> = async () => {
        callOrder.push("handler");
        return "done";
      };

      const wrapped = new MiddlewareChain(handler)
        .use(middleware1)
        .use(middleware2)
        .build();

      const result = await wrapped({});

      expect(result).toBe("done");
      // m2 é o mais externo (adicionado por último)
      expect(callOrder).toEqual([
        "m2-before",
        "m1-before",
        "handler",
        "m1-after",
        "m2-after",
      ]);
    });

    it("should work with a single middleware", async () => {
      const handler: ToolHandler<{ x: number }, any> = async (args) => args.x * 2;

      const wrapped = new MiddlewareChain(handler)
        .use(withTiming<{ x: number }, any>() as any)
        .build();

      const result = await wrapped({ x: 5 }) as any;
      expect(result).toBe(10);
    });

    it("should work with zero middlewares", async () => {
      const handler: ToolHandler<unknown, string> = async () => "no-wrap";
      const wrapped = new MiddlewareChain(handler).build();

      expect(await wrapped({})).toBe("no-wrap");
    });
  });
});
