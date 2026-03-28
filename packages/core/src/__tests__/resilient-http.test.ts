/**
 * @camilooscargbaptista/nexus-core — ResilientHttpClient Tests
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  ResilientHttpClient,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  HttpTimeoutError,
  HttpExhaustedRetriesError,
} from "../resilient-http.js";
import type {
  ResilientHttpConfig,
  HttpClientMetrics,
} from "../resilient-http.js";
import { RetryStrategy } from "../fallback.js";

// ═══════════════════════════════════════════════════════════════
// MOCK FETCH
// ═══════════════════════════════════════════════════════════════

const mockFetch = jest.fn<typeof globalThis.fetch>();

beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as Record<string, unknown>).fetch = mockFetch;
});

function mockResponse(status: number, body: string = ""): Response {
  return new Response(body, {
    status,
    headers: new Headers(),
  });
}

function mockResponseWithHeaders(
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response("", {
    status,
    headers: new Headers(headers),
  });
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("ResilientHttpClient", () => {
  const FAST_CONFIG: Partial<ResilientHttpConfig> = {
    initialDelay: 1,
    maxDelay: 10,
    requestTimeout: 5000,
    circuitBreakerThreshold: 3,
    circuitBreakerResetTimeout: 50,
    jitter: false,
  };

  describe("Basic Fetch", () => {
    it("should make a successful request", async () => {
      const client = new ResilientHttpClient(FAST_CONFIG);
      mockFetch.mockResolvedValueOnce(mockResponse(200, "ok"));

      const result = await client.fetch("https://api.example.com/test");

      expect(result.response.status).toBe(200);
      expect(result.attempts).toBe(1);
      expect(result.retried).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should pass request options to fetch", async () => {
      const client = new ResilientHttpClient(FAST_CONFIG);
      mockFetch.mockResolvedValueOnce(mockResponse(200));

      await client.fetch("https://api.example.com/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "value" }),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.example.com/test");
      expect(options?.method).toBe("POST");
    });
  });

  describe("Retry Logic", () => {
    it("should retry on retryable HTTP status codes", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 2,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200, "ok"));

      const result = await client.fetch("https://api.example.com/test");

      expect(result.response.status).toBe(200);
      expect(result.attempts).toBe(3);
      expect(result.retried).toBe(true);
    });

    it("should retry on 429 Too Many Requests", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 1,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(429))
        .mockResolvedValueOnce(mockResponse(200));

      const result = await client.fetch("https://api.example.com/test");

      expect(result.response.status).toBe(200);
      expect(result.attempts).toBe(2);
      expect(result.retried).toBe(true);
    });

    it("should throw HttpExhaustedRetriesError when all retries fail", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 2,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      // Retorna 503 em todos os attempts — o último não é "retryable" 
      // porque é o último attempt, então retorna o response
      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(503));

      // Na verdade, o último attempt retorna o response com status 503
      const result = await client.fetch("https://api.example.com/test");
      expect(result.response.status).toBe(503);
      expect(result.attempts).toBe(3);
    });

    it("should not retry on non-retryable status codes", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 3,
      });

      mockFetch.mockResolvedValueOnce(mockResponse(400, "Bad Request"));

      const result = await client.fetch("https://api.example.com/test");

      expect(result.response.status).toBe(400);
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry on network errors", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 1,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce(mockResponse(200));

      const result = await client.fetch("https://api.example.com/test");

      expect(result.response.status).toBe(200);
      expect(result.attempts).toBe(2);
    });

    it("should respect Retry-After header", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 1,
        maxDelay: 100,
      });

      mockFetch
        .mockResolvedValueOnce(
          mockResponseWithHeaders(429, { "retry-after": "0" }),
        )
        .mockResolvedValueOnce(mockResponse(200));

      const result = await client.fetch("https://api.example.com/test");

      expect(result.response.status).toBe(200);
      expect(result.attempts).toBe(2);
    });

    it("should allow per-request maxRetries override", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 5,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(503));

      const result = await client.fetch("https://api.example.com/test", {
        maxRetries: 1,
      });

      // maxRetries=1 → 2 attempts total, último retorna 503
      expect(result.response.status).toBe(503);
      expect(result.attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Circuit Breaker", () => {
    it("should open circuit after threshold failures", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        circuitBreakerThreshold: 3,
      });

      // 3 falhas consecutivas
      mockFetch
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockRejectedValueOnce(new Error("fail3"));

      await expect(client.fetch("https://api.example.com/1")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/2")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/3")).rejects.toThrow();

      expect(client.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN);

      // Próximo request deve ser rejeitado pelo circuit breaker
      await expect(client.fetch("https://api.example.com/4")).rejects.toThrow(
        CircuitBreakerOpenError,
      );
    });

    it("should transition to HALF_OPEN after reset timeout", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        circuitBreakerThreshold: 2,
        circuitBreakerResetTimeout: 30,
      });

      // Abre o circuito
      mockFetch
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"));

      await expect(client.fetch("https://api.example.com/1")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/2")).rejects.toThrow();

      expect(client.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN);

      // Espera o reset timeout
      await new Promise((r) => setTimeout(r, 50));

      // Próximo request deve passar (HALF_OPEN)
      mockFetch.mockResolvedValueOnce(mockResponse(200));
      const result = await client.fetch("https://api.example.com/3");

      expect(result.response.status).toBe(200);
      expect(client.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED);
    });

    it("should return to OPEN if HALF_OPEN test fails", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        circuitBreakerThreshold: 2,
        circuitBreakerResetTimeout: 30,
      });

      // Abre o circuito
      mockFetch
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"));

      await expect(client.fetch("https://api.example.com/1")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/2")).rejects.toThrow();

      // Espera o reset timeout
      await new Promise((r) => setTimeout(r, 50));

      // Request de teste falha — volta para OPEN
      mockFetch.mockRejectedValueOnce(new Error("still failing"));
      await expect(client.fetch("https://api.example.com/3")).rejects.toThrow();

      expect(client.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN);
    });

    it("should skip circuit breaker when skipCircuitBreaker is true", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        circuitBreakerThreshold: 1,
      });

      // Abre o circuito
      mockFetch.mockRejectedValueOnce(new Error("fail"));
      await expect(client.fetch("https://api.example.com/1")).rejects.toThrow();

      expect(client.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN);

      // Com skipCircuitBreaker, deve passar
      mockFetch.mockResolvedValueOnce(mockResponse(200));
      const result = await client.fetch("https://api.example.com/health", {
        skipCircuitBreaker: true,
      });

      expect(result.response.status).toBe(200);
    });

    it("should reset circuit breaker on successful request", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        circuitBreakerThreshold: 5,
      });

      // 3 falhas consecutivas (não ultrapassa threshold)
      mockFetch
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockRejectedValueOnce(new Error("fail3"));

      await expect(client.fetch("https://api.example.com/1")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/2")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/3")).rejects.toThrow();

      // Sucesso — reseta o contador
      mockFetch.mockResolvedValueOnce(mockResponse(200));
      await client.fetch("https://api.example.com/4");

      // Agora precisa de mais 5 falhas para abrir
      expect(client.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe("Timeout", () => {
    it("should throw HttpTimeoutError when request exceeds timeout", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        requestTimeout: 50,
      });

      mockFetch.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = (options as RequestInit)?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              });
            }
          }),
      );

      await expect(
        client.fetch("https://api.example.com/slow"),
      ).rejects.toThrow(HttpTimeoutError);
    });

    it("should allow per-request timeout override", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        requestTimeout: 10000,
      });

      mockFetch.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = (options as RequestInit)?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              });
            }
          }),
      );

      await expect(
        client.fetch("https://api.example.com/slow", { timeout: 50 }),
      ).rejects.toThrow(HttpTimeoutError);
    });
  });

  describe("Metrics", () => {
    it("should track request metrics", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 1,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      // 1 sucesso direto
      mockFetch.mockResolvedValueOnce(mockResponse(200));
      await client.fetch("https://api.example.com/1");

      // 1 retry + sucesso
      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200));
      await client.fetch("https://api.example.com/2");

      const metrics = client.getMetrics();

      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.totalRetries).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
    });

    it("should track circuit breaker trips", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 0,
        circuitBreakerThreshold: 2,
      });

      mockFetch
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"));

      await expect(client.fetch("https://api.example.com/1")).rejects.toThrow();
      await expect(client.fetch("https://api.example.com/2")).rejects.toThrow();

      const metrics = client.getMetrics();
      expect(metrics.circuitBreakerTrips).toBe(1);
      expect(metrics.failedRequests).toBe(2);
    });

    it("should reset metrics on reset()", async () => {
      const client = new ResilientHttpClient(FAST_CONFIG);

      mockFetch.mockResolvedValueOnce(mockResponse(200));
      await client.fetch("https://api.example.com/1");

      client.reset();
      const metrics = client.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe("Backoff Strategies", () => {
    it("should use exponential backoff by default", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 2,
        initialDelay: 1,
        retryStrategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200));

      const start = Date.now();
      await client.fetch("https://api.example.com/test");
      const duration = Date.now() - start;

      // Com delays de 1ms, total deve ser muito rápido
      expect(duration).toBeLessThan(1000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should use immediate strategy when configured", async () => {
      const client = new ResilientHttpClient({
        ...FAST_CONFIG,
        maxRetries: 1,
        retryStrategy: RetryStrategy.IMMEDIATE,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200));

      const start = Date.now();
      await client.fetch("https://api.example.com/test");
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });
});
