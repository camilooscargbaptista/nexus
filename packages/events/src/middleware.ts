/**
 * @nexus/events — Middleware Logging
 *
 * HOF (Higher-Order Function) para wrapping de tool handlers com logging automático,
 * correlation IDs e timing. Composável via MiddlewareChain.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { randomUUID } from "node:crypto";
import type { NexusEventBus } from "./index.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Contexto injetado no handler pelo middleware */
export interface MiddlewareContext {
  /** Correlation ID único para esta execução */
  correlationId: string;
  /** Timestamp de início */
  startTime: number;
  /** Nome da tool/handler */
  toolName: string;
}

/** Handler genérico que o middleware wraps */
export type ToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  context?: MiddlewareContext,
) => TResult | Promise<TResult>;

/** Middleware function type */
export type Middleware<TArgs = unknown, TResult = unknown> = (
  handler: ToolHandler<TArgs, TResult>,
) => ToolHandler<TArgs, TResult>;

// ═══════════════════════════════════════════════════════════════
// WITH LOGGING
// ═══════════════════════════════════════════════════════════════

/**
 * Wraps um tool handler com logging automático via NexusEventBus.
 *
 * Emite:
 * - `tool.started` — quando o handler inicia
 * - `tool.completed` — quando o handler completa com sucesso
 * - `tool.failed` — quando o handler joga erro
 *
 * @example
 * ```ts
 * const handler = (args) => analyzeCode(args.path);
 * const logged = withLogging("analyze-code", eventBus)(handler);
 * await logged({ path: "./src" });
 * ```
 */
export function withLogging<TArgs = unknown, TResult = unknown>(
  toolName: string,
  eventBus: NexusEventBus,
): Middleware<TArgs, TResult> {
  return (handler: ToolHandler<TArgs, TResult>): ToolHandler<TArgs, TResult> => {
    return async (args: TArgs, existingContext?: MiddlewareContext): Promise<TResult> => {
      const context: MiddlewareContext = existingContext ?? {
        correlationId: randomUUID(),
        startTime: Date.now(),
        toolName,
      };

      // Emit started
      await eventBus.publish(
        "tool.started" as any,
        "bridge" as any,
        {
          toolName,
          correlationId: context.correlationId,
          args: summarizeArgs(args),
        },
        { version: "1.0.0" } as any,
        context.correlationId,
      );

      try {
        const result = await Promise.resolve(handler(args, context));
        const duration = Date.now() - context.startTime;

        // Emit completed
        await eventBus.publish(
          "tool.completed" as any,
          "bridge" as any,
          {
            toolName,
            correlationId: context.correlationId,
            duration,
            success: true,
          },
          { version: "1.0.0" } as any,
          context.correlationId,
        );

        return result;
      } catch (error) {
        const duration = Date.now() - context.startTime;

        // Emit failed
        await eventBus.publish(
          "tool.failed" as any,
          "bridge" as any,
          {
            toolName,
            correlationId: context.correlationId,
            duration,
            error: error instanceof Error ? error.message : String(error),
          },
          { version: "1.0.0" } as any,
          context.correlationId,
        );

        throw error;
      }
    };
  };
}

// ═══════════════════════════════════════════════════════════════
// WITH TIMING
// ═══════════════════════════════════════════════════════════════

/**
 * Wraps um handler com timing — injeta duração no retorno.
 */
export function withTiming<TArgs = unknown, TResult = unknown>(): Middleware<
  TArgs,
  TResult & { _duration?: number }
> {
  return (handler) => {
    return async (args, context?) => {
      const start = Date.now();
      const result = await Promise.resolve(handler(args, context));

      if (typeof result === "object" && result !== null) {
        (result as Record<string, unknown>)._duration = Date.now() - start;
      }

      return result as TResult & { _duration?: number };
    };
  };
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE CHAIN
// ═══════════════════════════════════════════════════════════════

/**
 * Composição de múltiplos middlewares num handler.
 *
 * @example
 * ```ts
 * const wrapped = new MiddlewareChain(handler)
 *   .use(withLogging("my-tool", eventBus))
 *   .use(withTiming())
 *   .build();
 * ```
 */
export class MiddlewareChain<TArgs = unknown, TResult = unknown> {
  private middlewares: Middleware<TArgs, any>[] = [];
  private handler: ToolHandler<TArgs, TResult>;

  constructor(handler: ToolHandler<TArgs, TResult>) {
    this.handler = handler;
  }

  /**
   * Adiciona um middleware ao chain.
   * Middlewares são aplicados de fora para dentro (último adicionado = mais externo).
   */
  use(middleware: Middleware<TArgs, any>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Constrói o handler final com todos os middlewares aplicados.
   */
  build(): ToolHandler<TArgs, TResult> {
    let handler = this.handler;

    // Aplica do primeiro para o último (último adicionado = mais externo)
    for (let i = 0; i < this.middlewares.length; i++) {
      handler = this.middlewares[i]!(handler) as ToolHandler<TArgs, TResult>;
    }

    return handler;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Sumariza args para logging (evita logar payloads enormes).
 */
function summarizeArgs(args: unknown): unknown {
  if (args === null || args === undefined) return args;

  if (typeof args === "string") {
    return args.length > 200 ? args.substring(0, 200) + "..." : args;
  }

  if (typeof args === "object") {
    const summary: Record<string, unknown> = {};
    const entries = Object.entries(args as Record<string, unknown>);

    for (const [key, value] of entries.slice(0, 10)) {
      if (typeof value === "string" && value.length > 100) {
        summary[key] = value.substring(0, 100) + "...";
      } else {
        summary[key] = value;
      }
    }

    if (entries.length > 10) {
      summary._truncated = `${entries.length - 10} more fields`;
    }

    return summary;
  }

  return args;
}
