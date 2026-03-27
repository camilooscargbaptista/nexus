/**
 * Rate Limiter Middleware — Protege rotas do cloud contra brute force
 *
 * Implementa sliding window rate limiting in-memory.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { Request, Response, NextFunction } from "express";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Máximo de requests por janela */
  maxRequests: number;
  /** Janela de tempo (ms) — default 60s */
  windowMs: number;
  /** Mensagem de erro */
  message: string;
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════

/**
 * Rate limiter middleware para Express.
 *
 * @example
 * ```ts
 * // 5 tentativas de login por minuto
 * router.post("/login", rateLimiter({ maxRequests: 5, windowMs: 60000 }), handler);
 *
 * // 3 registros por IP por 10 minutos
 * router.post("/register", rateLimiter({ maxRequests: 3, windowMs: 600000 }), handler);
 * ```
 */
export function rateLimiter(options: Partial<RateLimiterOptions> = {}) {
  const config: RateLimiterOptions = {
    maxRequests: options.maxRequests ?? 10,
    windowMs: options.windowMs ?? 60_000,
    message: options.message ?? "Too many requests, please try again later.",
  };

  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 300_000);
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getClientKey(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      store.set(key, { count: 1, resetAt: now + config.windowMs });
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", config.maxRequests - 1);
      next();
      return;
    }

    entry.count++;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({ error: config.message, retryAfter });
      return;
    }

    next();
  };
}

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0]?.trim()
    : req.ip ?? req.socket.remoteAddress ?? "unknown";
  return `${ip}:${req.path}`;
}
