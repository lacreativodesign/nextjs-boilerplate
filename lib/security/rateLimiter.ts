import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { AppError } from "@/lib/errors";

const strictIpLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
});

const strictBlocker = new RateLimiterMemory({
  points: 10,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

const standardIpLimiter = new RateLimiterMemory({
  points: 30,
  duration: 60,
});

const standardUserLimiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
});

const relaxedIpLimiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
});

const relaxedUserLimiter = new RateLimiterMemory({
  points: 120,
  duration: 60,
});

const uploadUserLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
});

const DEFAULT_IP = "127.0.0.1";

type RateLimitTier = "strict" | "standard" | "relaxed" | "upload";

type RateLimitErrorDetails = {
  retryAfterMs: number;
  retryAfterSeconds: number;
};

function isRateLimiterRes(error: unknown): error is RateLimiterRes {
  return Boolean(error && typeof error === "object" && "msBeforeNext" in error);
}

function buildRateLimitError(result: RateLimiterRes): AppError {
  const retryAfterMs = Math.max(0, result.msBeforeNext || 0);
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  const details: RateLimitErrorDetails = {
    retryAfterMs,
    retryAfterSeconds,
  };

  return new AppError({
    message: "Rate limit exceeded. Please retry later.",
    code: "RATE_LIMITED",
    status: 429,
    details,
  });
}

async function consumeLimiter(limiter: RateLimiterMemory, key: string) {
  try {
    await limiter.consume(key);
  } catch (error) {
    if (isRateLimiterRes(error)) {
      throw buildRateLimitError(error);
    }
    throw error;
  }
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

export async function checkRateLimit(
  req: Request,
  tier: RateLimitTier,
  identifier?: string
): Promise<void> {
  const ip = getClientIp(req);
  const userKey = identifier?.trim();

  switch (tier) {
    case "strict": {
      // Block for 15 minutes after repeated attempts.
      await consumeLimiter(strictBlocker, ip);
      await consumeLimiter(strictIpLimiter, ip);
      return;
    }
    case "standard": {
      await consumeLimiter(standardIpLimiter, ip);
      if (userKey) {
        await consumeLimiter(standardUserLimiter, userKey);
      }
      return;
    }
    case "relaxed": {
      await consumeLimiter(relaxedIpLimiter, ip);
      if (userKey) {
        await consumeLimiter(relaxedUserLimiter, userKey);
      }
      return;
    }
    case "upload": {
      const uploadKey = userKey || ip;
      await consumeLimiter(uploadUserLimiter, uploadKey);
      return;
    }
    default: {
      return;
    }
  }
}
