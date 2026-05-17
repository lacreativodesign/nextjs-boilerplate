import { checkRateLimit } from "@/lib/rate-limit/limiter";

describe("rate limit defaults", () => {
  const baseContext = {
    tenantId: "tenant-1",
    userId: "session:user-1",
    ip: "203.0.113.10",
    endpoint: "/api/admin/dashboard/widgets",
    method: "POST",
    timestamp: 1_700_000_000_000,
  };

  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalKvUrl = process.env.KV_REST_API_URL;
  const originalKvToken = process.env.KV_REST_API_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterAll(() => {
    if (originalUpstashUrl) process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
    if (originalUpstashToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
    if (originalKvUrl) process.env.KV_REST_API_URL = originalKvUrl;
    if (originalKvToken) process.env.KV_REST_API_TOKEN = originalKvToken;
  });

  it("uses 60 requests per 60 seconds per authenticated user for API routes", async () => {
    const decision = await checkRateLimit({
      ...baseContext,
      authenticated: true,
    });

    expect(decision.ruleId).toBe("default-authenticated-user");
    expect(decision.limit).toBe(60);
    expect(decision.resetSeconds).toBe(60);
  });

  it("keeps unauthenticated API route defaults unchanged", async () => {
    const decision = await checkRateLimit({
      ...baseContext,
      userId: "ip:203.0.113.10",
      authenticated: false,
    });

    expect(decision.ruleId).toBe("default-write");
    expect(decision.limit).toBe(120);
    expect(decision.resetSeconds).toBe(60);
  });

  it("keeps auth endpoint defaults unchanged", async () => {
    const decision = await checkRateLimit({
      ...baseContext,
      endpoint: "/api/auth/send-otp",
      method: "POST",
      userId: "ip:203.0.113.10",
      authenticated: false,
    });

    expect(decision.ruleId).toBe("default-auth");
    expect(decision.limit).toBe(20);
    expect(decision.resetSeconds).toBe(60);
  });
});
