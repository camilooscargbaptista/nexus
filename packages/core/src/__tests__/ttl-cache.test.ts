/**
 * @nexus/core — TTLCache Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { TTLCache } from "../ttl-cache.js";
import type { TTLCacheConfig } from "../ttl-cache.js";

describe("TTLCache", () => {
  let cache: TTLCache<string, string>;

  const FAST_CONFIG: Partial<TTLCacheConfig> = {
    defaultTTL: 100,
    maxSize: 5,
    cleanupInterval: 0, // Desabilitar cleanup automático nos testes
  };

  beforeEach(() => {
    cache = new TTLCache<string, string>(FAST_CONFIG);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("get/set", () => {
    it("should store and retrieve values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("should return undefined for non-existent keys", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("should update existing keys", () => {
      cache.set("key1", "old");
      cache.set("key1", "new");
      expect(cache.get("key1")).toBe("new");
      expect(cache.size).toBe(1);
    });

    it("should report correct size", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      expect(cache.size).toBe(3);
    });
  });

  describe("TTL Expiration", () => {
    it("should expire entries after TTL", async () => {
      const shortCache = new TTLCache<string, string>({
        defaultTTL: 30,
        maxSize: 10,
        cleanupInterval: 0,
      });

      shortCache.set("ephemeral", "data");
      expect(shortCache.get("ephemeral")).toBe("data");

      await new Promise((r) => setTimeout(r, 50));

      expect(shortCache.get("ephemeral")).toBeUndefined();
      shortCache.destroy();
    });

    it("should support per-entry TTL override", async () => {
      cache.set("short", "dies-fast", 30);
      cache.set("long", "lives-long", 5000);

      await new Promise((r) => setTimeout(r, 50));

      expect(cache.get("short")).toBeUndefined();
      expect(cache.get("long")).toBe("lives-long");
    });

    it("should report expiration in has()", async () => {
      const shortCache = new TTLCache<string, string>({
        defaultTTL: 30,
        maxSize: 10,
        cleanupInterval: 0,
      });

      shortCache.set("temp", "data");
      expect(shortCache.has("temp")).toBe(true);

      await new Promise((r) => setTimeout(r, 50));

      expect(shortCache.has("temp")).toBe(false);
      shortCache.destroy();
    });
  });

  describe("LRU Eviction", () => {
    it("should evict LRU entry when maxSize is reached", () => {
      // maxSize = 5
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      cache.set("d", "4");
      cache.set("e", "5");

      // Access "a" to make it recently used
      cache.get("a");

      // Adicionar 6th entry — "b" é o LRU (nunca acessado após set)
      cache.set("f", "6");

      expect(cache.size).toBe(5);
      expect(cache.get("b")).toBeUndefined(); // evicted
      expect(cache.get("a")).toBe("1"); // still alive
      expect(cache.get("f")).toBe("6"); // new entry
    });

    it("should track eviction count in stats", () => {
      for (let i = 0; i < 8; i++) {
        cache.set(`key-${i}`, `val-${i}`);
      }

      const stats = cache.stats();
      expect(stats.evictions).toBe(3); // 8 - 5 maxSize = 3 evictions
      expect(stats.size).toBe(5);
    });
  });

  describe("getOrSet", () => {
    it("should return cached value if exists", async () => {
      cache.set("cached", "existing");
      let factoryCalled = false;

      const result = await cache.getOrSet("cached", () => {
        factoryCalled = true;
        return "new";
      });

      expect(result).toBe("existing");
      expect(factoryCalled).toBe(false);
    });

    it("should call factory and cache result on miss", async () => {
      const result = await cache.getOrSet("new-key", () => "computed");

      expect(result).toBe("computed");
      expect(cache.get("new-key")).toBe("computed");
    });

    it("should support async factories", async () => {
      const result = await cache.getOrSet("async-key", async () => {
        return "async-value";
      });

      expect(result).toBe("async-value");
      expect(cache.get("async-key")).toBe("async-value");
    });
  });

  describe("Stats", () => {
    it("should track hits and misses", () => {
      cache.set("key", "val");
      cache.get("key"); // hit
      cache.get("key"); // hit
      cache.get("missing"); // miss

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it("should return 0 hitRate when no requests", () => {
      expect(cache.stats().hitRate).toBe(0);
    });

    it("should reset stats without clearing data", () => {
      cache.set("key", "val");
      cache.get("key");
      cache.resetStats();

      const stats = cache.stats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(cache.get("key")).toBe("val"); // data preserved
    });
  });

  describe("clear/delete", () => {
    it("should clear all entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
    });

    it("should delete specific key", () => {
      cache.set("a", "1");
      cache.set("b", "2");

      expect(cache.delete("a")).toBe(true);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe("2");
    });

    it("should return false when deleting non-existent key", () => {
      expect(cache.delete("missing")).toBe(false);
    });
  });
});
