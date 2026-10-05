import { describe, expect, it, vi, beforeEach } from "vitest";
import { envVars } from "../../src/app/config/env";
import { redisService, RedisService } from "../../src/app/lib/redis";

describe("RedisService Unit & Integration Tests", () => {
  describe("Environment Configuration & Singleton", () => {
    it("recognizes Upstash configuration and initializes singleton", () => {
      expect(redisService).toBeDefined();
      if (envVars.UPSTASH_REDIS_REST_URL && envVars.UPSTASH_REDIS_REST_TOKEN) {
        expect(redisService.isUpstash).toBe(true);
      }
    });

    it("connect() does not throw and handles healthy/degraded states safely", async () => {
      await expect(redisService.connect()).resolves.toBeUndefined();
    });

    it("disconnect() executes cleanly without unhandled rejections", async () => {
      await expect(redisService.disconnect()).resolves.toBeUndefined();
    });
  });

  describe("In-Memory Fallback Mode", () => {
    let service: RedisService;

    beforeEach(() => {
      // Create a service with network disabled (pure in-memory)
      service = new RedisService({
        disableNetwork: true,
      });
      service.clearMemory();
    });

    it("should set and get values of various types", async () => {
      await service.set("test:str", "hello", 60);
      await service.set("test:num", 42, 60);
      await service.set("test:obj", { bcs: 45, topic: "history" }, 60);

      expect(await service.get<string>("test:str")).toBe("hello");
      expect(await service.get<number>("test:num")).toBe(42);
      expect(await service.get<{ bcs: number; topic: string }>("test:obj")).toEqual({
        bcs: 45,
        topic: "history",
      });
    });

    it("should return null for non-existent keys", async () => {
      const result = await service.get("test:nonexistent");
      expect(result).toBeNull();
    });

    it("should expire keys according to TTL", async () => {
      // Set key with -1s TTL (already expired)
      await service.set("test:expired", "expired-val", -1);
      const result = await service.get("test:expired");
      expect(result).toBeNull();
    });

    it("should delete specific keys with del()", async () => {
      await service.set("test:delete_me", "to_be_deleted", 60);
      expect(await service.get("test:delete_me")).toBe("to_be_deleted");

      await service.del("test:delete_me");
      expect(await service.get("test:delete_me")).toBeNull();
    });

    it("should delete keys matching wildcard patterns with deleteByPattern()", async () => {
      await service.set("exam:1:questions", "q1", 60);
      await service.set("exam:1:metadata", "m1", 60);
      await service.set("exam:2:questions", "q2", 60);
      await service.set("user:1:profile", "p1", 60);

      await service.deleteByPattern("exam:1:*");

      expect(await service.get("exam:1:questions")).toBeNull();
      expect(await service.get("exam:1:metadata")).toBeNull();
      expect(await service.get("exam:2:questions")).toBe("q2");
      expect(await service.get("user:1:profile")).toBe("p1");
    });

    it("should execute fetcher and cache result with withCache()", async () => {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return { data: "fetched" };
      };

      const result1 = await service.withCache("cache:test", 60, fetcher);
      expect(result1).toEqual({ data: "fetched" });
      expect(fetchCount).toBe(1);

      // Second call should return cached value without invoking fetcher
      const result2 = await service.withCache("cache:test", 60, fetcher);
      expect(result2).toEqual({ data: "fetched" });
      expect(fetchCount).toBe(1);
    });

    it("should enforce sliding window rate limiting with evaluateRateLimit()", async () => {
      const key = "rate:test:client";
      const limit = 3;
      const windowMs = 5000;

      const r1 = await service.evaluateRateLimit(key, limit, windowMs);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await service.evaluateRateLimit(key, limit, windowMs);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await service.evaluateRateLimit(key, limit, windowMs);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th request exceeds limit
      const r4 = await service.evaluateRateLimit(key, limit, windowMs);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
    });

    it("should compute consistent 16-character sha256 query hashes", () => {
      const hash1 = service.computeQueryHash({ subject: "BANGLA", year: 2024 });
      const hash2 = service.computeQueryHash({ subject: "BANGLA", year: 2024 });
      const hash3 = service.computeQueryHash({ subject: "ENGLISH", year: 2024 });

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe("Upstash REST Integration & Fallback Mode", () => {
    it("should delegate get, set, del, deleteByPattern to Upstash REST client when available", async () => {
      const mockPipeline = {
        zremrangebyscore: vi.fn(),
        zadd: vi.fn(),
        zcard: vi.fn(),
        pexpire: vi.fn(),
        exec: vi.fn().mockResolvedValue([0, 1, 2, 1]),
      };

      const mockUpstashClient = {
        get: vi.fn().mockResolvedValue(JSON.stringify({ from: "upstash" })),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        keys: vi.fn().mockResolvedValue(["upstash:k1", "upstash:k2"]),
        ping: vi.fn().mockResolvedValue("PONG"),
        pipeline: vi.fn().mockReturnValue(mockPipeline),
      };

      const service = new RedisService({
        upstashClient: mockUpstashClient as any,
      });

      expect(service.isUpstash).toBe(true);

      // Test set
      await service.set("my:key", { hello: "world" }, 120);
      expect(mockUpstashClient.set).toHaveBeenCalledWith(
        "my:key",
        JSON.stringify({ hello: "world" }),
        { ex: 120 }
      );

      // Test get
      const res = await service.get<{ from: string }>("my:key");
      expect(mockUpstashClient.get).toHaveBeenCalledWith("my:key");
      expect(res).toEqual({ from: "upstash" });

      // Test del
      await service.del("my:key");
      expect(mockUpstashClient.del).toHaveBeenCalledWith("my:key");

      // Test deleteByPattern
      await service.deleteByPattern("upstash:*");
      expect(mockUpstashClient.keys).toHaveBeenCalledWith("upstash:*");
      expect(mockUpstashClient.del).toHaveBeenCalledWith("upstash:k1", "upstash:k2");

      // Test evaluateRateLimit
      const rateRes = await service.evaluateRateLimit("upstash:rate", 5, 60000);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(rateRes.allowed).toBe(true);
      expect(rateRes.remaining).toBe(3);
    });

    it("should seamlessly fall back to memory when Upstash REST throws errors", async () => {
      const failingPipeline = {
        zremrangebyscore: vi.fn(),
        zadd: vi.fn(),
        zcard: vi.fn(),
        pexpire: vi.fn(),
        exec: vi.fn().mockRejectedValue(new Error("Network timeout")),
      };

      const failingUpstashClient = {
        get: vi.fn().mockRejectedValue(new Error("Upstash REST HTTP 500")),
        set: vi.fn().mockRejectedValue(new Error("Upstash REST HTTP 500")),
        del: vi.fn().mockRejectedValue(new Error("Upstash REST HTTP 500")),
        keys: vi.fn().mockRejectedValue(new Error("Upstash REST HTTP 500")),
        ping: vi.fn().mockRejectedValue(new Error("Upstash REST HTTP 500")),
        pipeline: vi.fn().mockReturnValue(failingPipeline),
      };

      const service = new RedisService({
        upstashClient: failingUpstashClient as any,
      });

      // connect() must not throw
      await expect(service.connect()).resolves.toBeUndefined();

      // set should catch error and fall back to memory
      await expect(service.set("fallback:key", "fallback-data", 60)).resolves.not.toThrow();

      // get should catch error and return memory-stored data
      const value = await service.get<string>("fallback:key");
      expect(value).toBe("fallback-data");

      // del should catch error and delete from memory
      await expect(service.del("fallback:key")).resolves.not.toThrow();
      expect(await service.get("fallback:key")).toBeNull();

      // evaluateRateLimit should catch error and fall back to memory store
      const rate = await service.evaluateRateLimit("fallback:rate", 2, 60000);
      expect(rate.allowed).toBe(true);
      expect(rate.remaining).toBe(1);
    });
  });

  describe("TCP node-redis Integration & Fallback Mode", () => {
    it("should fall back to memory when node-redis client fails", async () => {
      const mockMulti = {
        zRemRangeByScore: vi.fn(),
        zAdd: vi.fn(),
        zCard: vi.fn(),
        pExpire: vi.fn(),
        exec: vi.fn().mockRejectedValue(new Error("TCP Connection refused")),
      };

      const mockRedisClient = {
        get: vi.fn().mockRejectedValue(new Error("TCP Connection reset")),
        set: vi.fn().mockRejectedValue(new Error("TCP Connection reset")),
        del: vi.fn().mockRejectedValue(new Error("TCP Connection reset")),
        keys: vi.fn().mockRejectedValue(new Error("TCP Connection reset")),
        multi: vi.fn().mockReturnValue(mockMulti),
        connect: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
        quit: vi.fn().mockResolvedValue("OK"),
        on: vi.fn(),
      };

      const service = new RedisService({
        upstashUrl: null,
        upstashToken: null,
        redisClient: mockRedisClient as any,
      });

      // connect() handles error without throwing
      await expect(service.connect()).resolves.toBeUndefined();

      // In-memory fallback functions seamlessly
      await service.set("tcp:key", "tcp-val", 60);
      expect(await service.get<string>("tcp:key")).toBe("tcp-val");

      const rate = await service.evaluateRateLimit("tcp:rate", 3, 60000);
      expect(rate.allowed).toBe(true);
      expect(rate.remaining).toBe(2);
    });
  });
});
