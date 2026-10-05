import crypto from "node:crypto";
import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient, RedisClientType } from "redis";
import { envVars } from "../config/env";

interface MemoryCacheEntry {
  value: unknown;
  expiresAt: number;
}

export interface RedisServiceOptions {
  upstashUrl?: string | null;
  upstashToken?: string | null;
  redisUrl?: string | null;
  upstashClient?: UpstashRedis | null;
  redisClient?: RedisClientType | null;
  disableNetwork?: boolean;
}

export class RedisService {
  private upstashClient: UpstashRedis | null = null;
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private rateLimitStore: Map<string, number[]> = new Map();

  constructor(options?: RedisServiceOptions) {
    if (options?.disableNetwork) {
      return;
    }

    if (options?.upstashClient !== undefined) {
      this.upstashClient = options.upstashClient;
    } else {
      const upstashUrl =
        options?.upstashUrl !== undefined
          ? options.upstashUrl
          : envVars.UPSTASH_REDIS_REST_URL;
      const upstashToken =
        options?.upstashToken !== undefined
          ? options.upstashToken
          : envVars.UPSTASH_REDIS_REST_TOKEN;

      if (upstashUrl && upstashToken) {
        try {
          this.upstashClient = new UpstashRedis({
            url: upstashUrl,
            token: upstashToken,
          });
        } catch (err: any) {
          console.warn("Failed to initialize Upstash Redis REST client:", err?.message);
          this.upstashClient = null;
        }
      }
    }

    if (options?.redisClient !== undefined) {
      this.client = options.redisClient;
    } else if (!this.upstashClient) {
      const redisUrl =
        options?.redisUrl !== undefined ? options.redisUrl : envVars.REDIS_URL;

      if (redisUrl) {
        try {
          this.client = createClient({
            url: redisUrl,
            socket: {
              connectTimeout: 2000,
              reconnectStrategy: (retries) => {
                if (retries > 2) {
                  return new Error("Max Redis connection attempts reached");
                }
                return Math.min(retries * 50, 200);
              },
            },
          });

          this.client.on("error", (err) => {
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
    }
  }

  public get isUpstash(): boolean {
    return this.upstashClient !== null;
  }

  public get isRedisClientConnected(): boolean {
    return this.isConnected;
  }

  public async connect(): Promise<void> {
    if (this.upstashClient) {
      try {
        await this.upstashClient.ping();
      } catch (err: any) {
        console.warn("Upstash Redis ping failed, fallback will be used:", err?.message);
      }
      return;
    }

    if (!this.client || this.isConnected) return;
    try {
      await this.client.connect();
      this.isConnected = true;
    } catch (err: any) {
      console.warn("Unable to connect to Redis. In-memory fallback will be used:", err.message);
      this.isConnected = false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        if (this.isConnected) {
          await this.client.quit();
        } else {
          await this.client.disconnect();
        }
      } catch {
        // ignore
      }
      this.isConnected = false;
    }
  }

  public clearMemory(): void {
    this.memoryCache.clear();
    this.rateLimitStore.clear();
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.upstashClient) {
      try {
        const raw = await this.upstashClient.get(key);
        if (raw !== null && raw !== undefined) {
          if (typeof raw === "string") {
            try {
              return JSON.parse(raw) as T;
            } catch {
              return raw as unknown as T;
            }
          }
          return raw as T;
        }
        return null;
      } catch (err: any) {
        console.warn("Upstash Redis get error, attempting fallback:", err?.message);
      }
    }

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
    if (this.upstashClient) {
      try {
        await this.upstashClient.set(key, JSON.stringify(value), {
          ex: ttlSeconds,
        });
        return;
      } catch (err: any) {
        console.warn("Upstash Redis set error, attempting fallback:", err?.message);
      }
    }

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
    if (this.upstashClient) {
      try {
        await this.upstashClient.del(key);
      } catch (err: any) {
        console.warn("Upstash Redis del error, attempting fallback:", err?.message);
      }
    }

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
    if (this.upstashClient) {
      try {
        const keys = await this.upstashClient.keys(pattern);
        if (keys && keys.length > 0) {
          await this.upstashClient.del(...keys);
        }
      } catch (err: any) {
        console.warn("Upstash Redis deleteByPattern error, attempting fallback:", err?.message);
      }
    }

    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys && keys.length > 0) {
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

    if (this.upstashClient) {
      try {
        const clearBefore = now - windowMs;
        const pipeline = this.upstashClient.pipeline();
        pipeline.zremrangebyscore(key, 0, clearBefore);
        pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` });
        pipeline.zcard(key);
        pipeline.pexpire(key, windowMs);

        const results = await pipeline.exec();
        const count = (results[2] as unknown as number) || 1;

        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);

        return {
          allowed,
          remaining,
          resetMs: windowMs,
        };
      } catch (err: any) {
        console.warn("Upstash Redis evaluateRateLimit error, attempting fallback:", err?.message);
      }
    }

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
