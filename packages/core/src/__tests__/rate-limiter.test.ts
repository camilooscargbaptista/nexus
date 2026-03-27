/**
 * @nexus/core — RateLimiter Tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { RateLimiter } from "../rate-limiter.js";

describe("RateLimiter", () => {
  describe("Sliding Window", () => {
    it("should allow requests within limit", async () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      const r1 = await limiter.acquire();
      const r2 = await limiter.acquire();
      const r3 = await limiter.acquire();

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
      expect(r2.remaining).toBe(1);
      expect(r3.remaining).toBe(0);
    });

    it("should reject requests exceeding limit", async () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      await limiter.acquire();
      await limiter.acquire();
      const r3 = await limiter.acquire();

      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.retryAfterMs).toBeGreaterThan(0);
    });

    it("should allow requests after window expires", async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 30 });

      const r1 = await limiter.acquire();
      expect(r1.allowed).toBe(true);

      const r2 = await limiter.acquire();
      expect(r2.allowed).toBe(false);

      // Espera a janela expirar
      await new Promise((r) => setTimeout(r, 50));

      const r3 = await limiter.acquire();
      expect(r3.allowed).toBe(true);
    });

    it("should calculate retryAfterMs correctly", async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 100 });

      await limiter.acquire();
      const result = await limiter.acquire();

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(100);
    });
  });

  describe("waitForSlot", () => {
    it("should wait and acquire when slot becomes available", async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 30 });

      await limiter.acquire();

      const start = Date.now();
      const result = await limiter.waitForSlot();
      const elapsed = Date.now() - start;

      expect(result.allowed).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(20); // waited for window
    });

    it("should respect timeout", async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 5000 });

      await limiter.acquire();

      const result = await limiter.waitForSlot(50);

      expect(result.allowed).toBe(false);
    });

    it("should return immediately if slot is available", async () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

      const start = Date.now();
      const result = await limiter.waitForSlot();
      const elapsed = Date.now() - start;

      expect(result.allowed).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe("Concurrent Access", () => {
    it("should not allow more than maxRequests concurrently", async () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      // Fire 5 concurrent acquires
      const results = await Promise.all([
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire(),
      ]);

      const allowed = results.filter((r) => r.allowed).length;
      const rejected = results.filter((r) => !r.allowed).length;

      expect(allowed).toBe(3);
      expect(rejected).toBe(2);
    });
  });

  describe("Stats", () => {
    it("should track allowed and rejected", async () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire(); // rejected

      const stats = limiter.stats();
      expect(stats.totalAllowed).toBe(2);
      expect(stats.totalRejected).toBe(1);
      expect(stats.activeInWindow).toBe(2);
      expect(stats.maxRequests).toBe(2);
    });

    it("should reflect current window in activeInWindow", async () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 30 });

      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.stats().activeInWindow).toBe(2);

      await new Promise((r) => setTimeout(r, 50));

      expect(limiter.stats().activeInWindow).toBe(0);
    });
  });

  describe("Reset", () => {
    it("should clear all state", async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10000 });

      await limiter.acquire();

      const beforeReset = await limiter.acquire();
      expect(beforeReset.allowed).toBe(false);

      limiter.reset();

      const afterReset = await limiter.acquire();
      expect(afterReset.allowed).toBe(true);

      const stats = limiter.stats();
      expect(stats.totalAllowed).toBe(1);
      expect(stats.totalRejected).toBe(0);
    });
  });
});
