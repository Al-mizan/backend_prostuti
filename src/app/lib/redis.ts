import crypto from "node:crypto";
import { createClient, RedisClientType } from "redis";
import { envVars } from "../config/env";

interface MemoryCacheEntry {
  value: unknown;
  expiresAt: number;
}

export class RedisService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private rateLimitStore: Map<string, number[]> = new Map();

  constructor() {
    try {
      this.client = createClient({
        url: envVars.REDIS_URL,
      });

      this.client.on("error", (err) => {
        // Log once or suppress to prevent unhandled rejections
        if (this.isConnected) {
          console.warn("Redis client error, falling back to memory:", err.message);
        }
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        this.isConnected = true;
      });

      this.client.on("end", () => {
        this.isConnected = false;
      });
    } catch {
      this.isConnected = false;
    }
  }

  public async connect(): Promise<void> {
    if (!this.client || this.isConnected) return;
    try {
      await this.client.connect();
      this.isConnected = true;
    } catch (err: any) {
      console.warn("Unable to connect to Redis. In-memory fallback will be used:", err.message);
      this.isConnected = false;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.isConnected && this.client) {
      try {
        const raw = await this.client.get(key);
        if (raw !== null) {
          return JSON.parse(raw) as T;
        }
        return null;
      } catch {
        // Fall back to memory
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  public async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, JSON.stringify(value), {
          EX: ttlSeconds,
        });
        return;
      } catch {
        // Fall back to memory
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch {
        // Ignore
      }
    }
    this.memoryCache.delete(key);
  }

  public async deleteByPattern(pattern: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      } catch {
        // Fall back to memory
      }
    }

    // Regex matching in memory
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  public async withCache<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  public async evaluateRateLimit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const now = Date.now();

    if (this.isConnected && this.client) {
      try {
        const clearBefore = now - windowMs;
        const multi = this.client.multi();
        multi.zRemRangeByScore(key, 0, clearBefore);
        multi.zAdd(key, { score: now, value: `${now}:${Math.random()}` });
        multi.zCard(key);
        multi.pExpire(key, windowMs);

        const results = await multi.exec();
        const count = (results[2] as unknown as number) || 1;

        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);

        return {
          allowed,
          remaining,
          resetMs: windowMs,
        };
      } catch {
        // Fall back to memory
      }
    }

    // In-memory sliding window rate limiting
    const timestamps = this.rateLimitStore.get(key) || [];
    const validTimestamps = timestamps.filter((ts) => ts > now - windowMs);

    validTimestamps.push(now);
    this.rateLimitStore.set(key, validTimestamps);

    const allowed = validTimestamps.length <= limit;
    const remaining = Math.max(0, limit - validTimestamps.length);

    return {
      allowed,
      remaining,
      resetMs: windowMs,
    };
  }

  public computeQueryHash(query: unknown): string {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(query || {}))
      .digest("hex")
      .slice(0, 16);
  }
}

export const redisService = new RedisService();
