// Edge-compatible: no Node.js crypto import needed

export type RateLimitRule = {
  id: string;
  endpointPattern: string;
  limit: number;
  windowSeconds: number;
  scope: "tenant" | "user" | "both";
  enabled: boolean;
  priority: number;
};

export type TenantQuota = {
  tenantId: string;
  dailyLimit: number;
  monthlyLimit: number;
  plan: string;
};

export type ThrottleException = {
  type: "ip" | "user";
  value: string;
};

export type RateLimitContext = {
  tenantId: string;
  userId: string;
  ip: string;
  endpoint: string;
  method: string;
  timestamp: number;
  authenticated?: boolean;
};

export type RateLimitDecision = {
  allowed: boolean;
  status: number;
  reason?: "RATE_LIMIT" | "QUOTA_EXCEEDED";
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
  ruleId: string;
  quota?: {
    dailyLimit: number;
    dailyUsed: number;
    monthlyLimit: number;
    monthlyUsed: number;
  };
};

type UpstashConfig = { url: string; token: string };

type UpstashPipelineResult = Array<{ result?: unknown }>;

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 120;
const AUTHENTICATED_USER_LIMIT = 60;
const AUTHENTICATED_USER_WINDOW_SECONDS = 60;
const CACHE_TTL_SECONDS = 30;

let configCache: {
  loadedAt: number;
  rules: RateLimitRule[];
  quotas: Record<string, TenantQuota>;
  exceptions: ThrottleException[];
} | null = null;

function getUpstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function upstashPipeline(commands: unknown[][]): Promise<UpstashPipelineResult | null> {
  const upstash = getUpstashConfig();
  if (!upstash) return null;

  const response = await fetch(`${upstash.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json()) as UpstashPipelineResult;
}

async function upstashGetJson<T>(key: string): Promise<T | null> {
  const upstash = getUpstashConfig();
  if (!upstash) return null;

  const response = await fetch(`${upstash.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${upstash.token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { result?: string | null };
  if (!json.result) return null;

  try {
    return JSON.parse(json.result) as T;
  } catch {
    return null;
  }
}

export async function persistRateLimitConfig(config: {
  rules: RateLimitRule[];
  quotas: Record<string, TenantQuota>;
  exceptions: ThrottleException[];
}) {
  const upstash = getUpstashConfig();
  if (!upstash) return;

  await fetch(`${upstash.url}/set/rl:config`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value: JSON.stringify(config),
      ex: 300,
    }),
  });
}

function matchPattern(pathname: string, pattern: string) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(pathname);
}

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).padStart(8, "0").slice(0, 24);
}

function defaultRuleForEndpoint(pathname: string, method: string, authenticated = false): RateLimitRule {
  const normalizedMethod = method.toUpperCase();
  const isAuthEndpoint = pathname.startsWith("/api/auth") || pathname.startsWith("/api/session-login") || pathname.startsWith("/api/logout");
  const isRead = normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS";

  if (isAuthEndpoint) {
    return {
      id: "default-auth",
      endpointPattern: "/api/auth*",
      limit: 20,
      windowSeconds: 60,
      scope: "both",
      enabled: true,
      priority: 100,
    };
  }

  if (authenticated) {
    return {
      id: "default-authenticated-user",
      endpointPattern: pathname,
      limit: AUTHENTICATED_USER_LIMIT,
      windowSeconds: AUTHENTICATED_USER_WINDOW_SECONDS,
      scope: "user",
      enabled: true,
      priority: 50,
    };
  }

  if (isRead) {
    return {
      id: "default-read",
      endpointPattern: "/api/*",
      limit: 300,
      windowSeconds: 60,
      scope: "both",
      enabled: true,
      priority: 10,
    };
  }

  return {
    id: "default-write",
    endpointPattern: "/api/*",
    limit: 120,
    windowSeconds: 60,
    scope: "both",
    enabled: true,
    priority: 20,
  };
}

async function getConfig() {
  if (configCache && Date.now() - configCache.loadedAt < CACHE_TTL_SECONDS * 1000) {
    return configCache;
  }

  const config = await upstashGetJson<{
    rules: RateLimitRule[];
    quotas: Record<string, TenantQuota>;
    exceptions: ThrottleException[];
  }>("rl:config");

  configCache = {
    loadedAt: Date.now(),
    rules: config?.rules || [],
    quotas: config?.quotas || {},
    exceptions: config?.exceptions || [],
  };

  return configCache;
}

function isException(exceptions: ThrottleException[], ip: string, userId: string) {
  return exceptions.some((entry) => {
    if (entry.type === "ip") return entry.value === ip;
    return entry.value === userId;
  });
}

function resolveRule(pathname: string, method: string, rules: RateLimitRule[], authenticated = false) {
  const matched = rules
    .filter((rule) => rule.enabled && matchPattern(pathname, rule.endpointPattern))
    .sort((a, b) => b.priority - a.priority);

  return matched[0] || defaultRuleForEndpoint(pathname, method, authenticated);
}

async function slidingWindowCount(key: string, windowSeconds: number, nowMs: number) {
  const member = `${nowMs}-${crypto.randomUUID()}`;
  const min = nowMs - windowSeconds * 1000;
  const pipeline = await upstashPipeline([
    ["ZADD", key, String(nowMs), member],
    ["ZREMRANGEBYSCORE", key, "-inf", String(min)],
    ["ZCARD", key],
    ["PEXPIRE", key, String(windowSeconds * 1000)],
  ]);

  const count = Number(pipeline?.[2]?.result || 1);
  return count;
}

async function incrementCounterFallback(key: string, windowSeconds: number) {
  const pipeline = await upstashPipeline([
    ["INCR", key],
    ["EXPIRE", key, String(windowSeconds), "NX"],
    ["TTL", key],
  ]);

  return {
    count: Number(pipeline?.[0]?.result || 1),
    ttl: Number(pipeline?.[2]?.result || windowSeconds),
  };
}

async function enforceLimit(scope: "tenant" | "user", id: string, rule: RateLimitRule, nowMs: number) {
  const key = `rl:sw:${scope}:${hash(id)}:${hash(rule.endpointPattern)}:${rule.windowSeconds}`;

  const count = await slidingWindowCount(key, rule.windowSeconds, nowMs);
  const over = count > rule.limit;

  if (!Number.isFinite(count) || count <= 0) {
    const fallback = await incrementCounterFallback(`${key}:fallback`, rule.windowSeconds);
    return {
      allowed: fallback.count <= rule.limit,
      count: fallback.count,
      remaining: Math.max(0, rule.limit - fallback.count),
      resetSeconds: Math.max(1, fallback.ttl),
    };
  }

  return {
    allowed: !over,
    count,
    remaining: Math.max(0, rule.limit - count),
    resetSeconds: rule.windowSeconds,
  };
}

async function enforceQuota(tenantId: string, quota: TenantQuota) {
  const now = new Date();
  const dayKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

  const dayCounter = await incrementCounterFallback(`rl:quota:day:${hash(tenantId)}:${dayKey}`, 172800);
  const monthCounter = await incrementCounterFallback(`rl:quota:month:${hash(tenantId)}:${monthKey}`, 2678400);

  const over = dayCounter.count > quota.dailyLimit || monthCounter.count > quota.monthlyLimit;

  return {
    allowed: !over,
    dailyUsed: dayCounter.count,
    monthlyUsed: monthCounter.count,
  };
}

export async function checkRateLimit(context: RateLimitContext): Promise<RateLimitDecision> {
  const config = await getConfig();

  if (isException(config.exceptions, context.ip, context.userId)) {
    return {
      allowed: true,
      status: 200,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
      resetSeconds: DEFAULT_WINDOW_SECONDS,
      retryAfterSeconds: 0,
      ruleId: "exception",
    };
  }

  const rule = resolveRule(context.endpoint, context.method, config.rules, Boolean(context.authenticated));
  const nowMs = context.timestamp;

  let tenantResult = { allowed: true, remaining: rule.limit, resetSeconds: rule.windowSeconds };
  let userResult = { allowed: true, remaining: rule.limit, resetSeconds: rule.windowSeconds };

  if (rule.scope === "tenant" || rule.scope === "both") {
    tenantResult = await enforceLimit("tenant", context.tenantId, rule, nowMs);
  }
  if (rule.scope === "user" || rule.scope === "both") {
    userResult = await enforceLimit("user", context.userId, rule, nowMs);
  }

  if (!tenantResult.allowed || !userResult.allowed) {
    const resetSeconds = Math.max(tenantResult.resetSeconds, userResult.resetSeconds);
    return {
      allowed: false,
      status: 429,
      reason: "RATE_LIMIT",
      limit: rule.limit,
      remaining: Math.min(tenantResult.remaining, userResult.remaining),
      resetSeconds,
      retryAfterSeconds: resetSeconds,
      ruleId: rule.id,
    };
  }

  const quota = config.quotas[context.tenantId];
  if (quota) {
    const quotaResult = await enforceQuota(context.tenantId, quota);
    if (!quotaResult.allowed) {
      return {
        allowed: false,
        status: 429,
        reason: "QUOTA_EXCEEDED",
        limit: rule.limit,
        remaining: 0,
        resetSeconds: DEFAULT_WINDOW_SECONDS,
        retryAfterSeconds: DEFAULT_WINDOW_SECONDS,
        ruleId: rule.id,
        quota: {
          dailyLimit: quota.dailyLimit,
          dailyUsed: quotaResult.dailyUsed,
          monthlyLimit: quota.monthlyLimit,
          monthlyUsed: quotaResult.monthlyUsed,
        },
      };
    }

    return {
      allowed: true,
      status: 200,
      limit: rule.limit,
      remaining: Math.min(tenantResult.remaining, userResult.remaining),
      resetSeconds: Math.max(tenantResult.resetSeconds, userResult.resetSeconds),
      retryAfterSeconds: 0,
      ruleId: rule.id,
      quota: {
        dailyLimit: quota.dailyLimit,
        dailyUsed: quotaResult.dailyUsed,
        monthlyLimit: quota.monthlyLimit,
        monthlyUsed: quotaResult.monthlyUsed,
      },
    };
  }

  return {
    allowed: true,
    status: 200,
    limit: rule.limit || DEFAULT_LIMIT,
    remaining: Math.min(tenantResult.remaining, userResult.remaining),
    resetSeconds: Math.max(tenantResult.resetSeconds, userResult.resetSeconds),
    retryAfterSeconds: 0,
    ruleId: rule.id,
  };
}

export function buildRateLimitHeaders(decision: RateLimitDecision) {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(Math.max(0, decision.remaining)),
    "X-RateLimit-Reset": String(decision.resetSeconds),
    "X-RateLimit-Rule": decision.ruleId,
  };
}
