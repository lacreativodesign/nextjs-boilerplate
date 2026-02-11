import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";

export type RateLimitTier = "strict" | "standard" | "relaxed" | "upload";

type TierConfig = {
  limit: number;
  windowSeconds: number;
  scope: "ip" | "user" | "ip_and_user";
};

type CounterResult = {
  count: number;
  ttlSeconds: number;
};

type RateLimitContext = {
  key: string;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
};

const DEFAULT_IP = "127.0.0.1";
const FALLBACK_TTL_SECONDS = 60;

const TIER_CONFIG: Record<RateLimitTier, TierConfig> = {
  strict: { limit: 8, windowSeconds: 60, scope: "ip_and_user" },
  standard: { limit: 120, windowSeconds: 60, scope: "ip_and_user" },
  relaxed: { limit: 240, windowSeconds: 60, scope: "ip_and_user" },
  upload: { limit: 30, windowSeconds: 60, scope: "user" },
};

const inMemoryStore = new Map<string, { count: number; resetAtMs: number }>();

function toHashedKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function incrementCounterRedis(key: string, windowSeconds: number): Promise<CounterResult> {
  const upstash = getUpstashConfig();
  if (!upstash) {
    return incrementCounterMemory(key, windowSeconds);
  }

  const response = await fetch(`${upstash.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSeconds), "NX"],
      ["TTL", key],
    ]),
    cache: "no-store",
  });

  if (!response.ok) {
    return incrementCounterMemory(key, windowSeconds);
  }

  const data = (await response.json()) as Array<{ result?: unknown }>;
  const count = Number(data?.[0]?.result || 0);
  const ttl = Number(data?.[2]?.result || FALLBACK_TTL_SECONDS);

  return {
    count,
    ttlSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

function incrementCounterMemory(key: string, windowSeconds: number): CounterResult {
  const now = Date.now();
  const existing = inMemoryStore.get(key);
  if (!existing || existing.resetAtMs <= now) {
    const resetAtMs = now + windowSeconds * 1000;
    inMemoryStore.set(key, { count: 1, resetAtMs });
    return { count: 1, ttlSeconds: windowSeconds };
  }

  const count = existing.count + 1;
  inMemoryStore.set(key, { count, resetAtMs: existing.resetAtMs });

  return {
    count,
    ttlSeconds: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
  };
}

function isSafeMethod(method: string) {
  const normalized = method.toUpperCase();
  return normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS";
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp = req.headers.get("x-real-ip")
    || req.headers.get("cf-connecting-ip")
    || req.headers.get("x-vercel-forwarded-for");

  return realIp?.trim() || DEFAULT_IP;
}

function resolveRateLimitKey(req: Request, tier: RateLimitTier, identifier?: string): string {
  const ip = getClientIp(req);
  const cleanIdentifier = identifier?.trim() || "";
  const config = TIER_CONFIG[tier];

  if (config.scope === "ip") {
    return `${tier}:ip:${toHashedKey(ip)}`;
  }
  if (config.scope === "user") {
    const token = cleanIdentifier || req.headers.get("x-user-id")?.trim() || ip;
    return `${tier}:user:${toHashedKey(token)}`;
  }

  const composite = cleanIdentifier
    ? `${ip}:${cleanIdentifier}`
    : `${ip}:${req.headers.get("user-agent") || "unknown"}`;
  return `${tier}:combo:${toHashedKey(composite)}`;
}

function buildRateLimitContext(req: Request, tier: RateLimitTier, count: number, ttlSeconds: number, identifier?: string): RateLimitContext {
  const limit = TIER_CONFIG[tier].limit;
  const remaining = Math.max(0, limit - count);
  const retryAfterSeconds = count > limit ? ttlSeconds : 0;

  return {
    key: resolveRateLimitKey(req, tier, identifier),
    limit,
    remaining,
    resetSeconds: ttlSeconds,
    retryAfterSeconds,
  };
}

export function applyRateLimitHeaders(headers: Headers, context: Pick<RateLimitContext, "limit" | "remaining" | "resetSeconds" | "retryAfterSeconds">) {
  headers.set("X-RateLimit-Limit", String(context.limit));
  headers.set("X-RateLimit-Remaining", String(context.remaining));
  headers.set("X-RateLimit-Reset", String(context.resetSeconds));
  headers.set("RateLimit-Policy", `${context.limit};w=${context.resetSeconds}`);
  if (context.retryAfterSeconds > 0) {
    headers.set("Retry-After", String(context.retryAfterSeconds));
  }
}

export async function checkRateLimit(req: Request, tier: RateLimitTier, identifier?: string): Promise<RateLimitContext> {
  if (isSafeMethod(req.method) && tier !== "strict") {
    const tierConfig = TIER_CONFIG[tier];
    const key = resolveRateLimitKey(req, tier, identifier);
    return {
      key,
      limit: tierConfig.limit,
      remaining: tierConfig.limit,
      resetSeconds: tierConfig.windowSeconds,
      retryAfterSeconds: 0,
    };
  }

  const key = resolveRateLimitKey(req, tier, identifier);
  const config = TIER_CONFIG[tier];
  const counter = await incrementCounterRedis(key, config.windowSeconds);
  const context = buildRateLimitContext(req, tier, counter.count, counter.ttlSeconds, identifier);

  if (counter.count > config.limit) {
    throw new AppError({
      message: "Rate limit exceeded. Please retry later.",
      code: "RATE_LIMITED",
      status: 429,
      details: {
        retryAfterMs: context.retryAfterSeconds * 1000,
        retryAfterSeconds: context.retryAfterSeconds,
        limit: config.limit,
      },
    });
  }

  return context;
}
