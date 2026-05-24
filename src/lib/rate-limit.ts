import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";
import { RateLimiterMemory } from "rate-limiter-flexible";

export type RateLimitType =
  | "core"
  | "guestbook"
  | "contact"
  | "achievements"
  | "chat";

// --- Configuration ---
const LIMITERS: Record<
  RateLimitType,
  { points: number; duration: Duration; blockDuration: number }
> = {
  core: { points: 20, duration: "60 s", blockDuration: 60 },
  guestbook: { points: 5, duration: "60 s", blockDuration: 60 },
  contact: { points: 3, duration: "1 h", blockDuration: 60 * 60 },

  achievements: { points: 10, duration: "60 s", blockDuration: 60 },
  // AI calls cost money — tighter bucket than core.
  chat: { points: 10, duration: "60 s", blockDuration: 60 },
};

// --- Cache Containers ---
const redisLimiters = new Map<RateLimitType, Ratelimit>();
const memoryLimiters = new Map<RateLimitType, RateLimiterMemory>();

function getRedisLimiter(type: RateLimitType): Ratelimit {
  if (!redisLimiters.has(type)) {
    const config = LIMITERS[type];
    redisLimiters.set(
      type,
      new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(config.points, config.duration),
        analytics: true,
        prefix: `@upstash/ratelimit/${type}`,
      }),
    );
  }
  return redisLimiters.get(type)!;
}

function getMemoryLimiter(type: RateLimitType): RateLimiterMemory {
  if (!memoryLimiters.has(type)) {
    const config = LIMITERS[type];
    memoryLimiters.set(
      type,
      new RateLimiterMemory({
        points: config.points,
        duration: config.blockDuration,
      }),
    );
  }
  return memoryLimiters.get(type)!;
}

export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = "core",
) {
  // 1. BYPASS: Check for CI/Test environment
  if (process.env.SKIP_RATE_LIMIT === "true" && identifier !== "6.6.6.6") {
    return;
  }

  const isProductionRedis =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    if (isProductionRedis) {
      // --- REDIS MODE ---
      const limiter = getRedisLimiter(type);
      const { success, reset } = await limiter.limit(identifier);

      if (!success) {
        const now = Date.now();
        const retryAfter = Math.ceil((reset - now) / 1000);
        throw new Error(`Rate limit exceeded. Try again in ${retryAfter}s.`);
      }
    } else {
      // --- MEMORY MODE ---
      const limiter = getMemoryLimiter(type);
      await limiter.consume(identifier);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Rate limit exceeded")
    ) {
      throw error;
    }
    throw new Error("Rate limit exceeded. Please try again later.");
  }
}
