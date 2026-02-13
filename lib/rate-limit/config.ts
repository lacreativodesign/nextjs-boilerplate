import { adminDb } from "@/lib/firebaseAdmin";
import { persistRateLimitConfig, RateLimitRule, TenantQuota, ThrottleException } from "@/lib/rate-limit/limiter";

export async function loadRateLimitConfigFromFirestore() {
  const [rulesSnap, quotaSnap, exceptionsSnap] = await Promise.all([
    adminDb.collection("rate_limit_rules").where("enabled", "==", true).get(),
    adminDb.collection("tenant_quotas").get(),
    adminDb.collection("throttle_exceptions").where("enabled", "==", true).get(),
  ]);

  const rules: RateLimitRule[] = rulesSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      endpointPattern: String(data.endpointPattern || "/api/*"),
      limit: Number(data.limit || 120),
      windowSeconds: Number(data.windowSeconds || 60),
      scope: data.scope === "tenant" || data.scope === "user" ? data.scope : "both",
      enabled: Boolean(data.enabled ?? true),
      priority: Number(data.priority || 1),
    };
  });

  const quotas: Record<string, TenantQuota> = Object.fromEntries(
    quotaSnap.docs.map((doc) => {
      const data = doc.data();
      return [
        doc.id,
        {
          tenantId: doc.id,
          dailyLimit: Number(data.dailyLimit || 0),
          monthlyLimit: Number(data.monthlyLimit || 0),
          plan: String(data.plan || "custom"),
        },
      ];
    })
  );

  const exceptions: ThrottleException[] = exceptionsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      type: data.type === "ip" ? "ip" : "user",
      value: String(data.value || ""),
    };
  });

  const payload = {
    rules,
    quotas: Object.fromEntries(Object.entries(quotas).filter(([, q]) => q.dailyLimit > 0 || q.monthlyLimit > 0)),
    exceptions: exceptions.filter((entry) => entry.value),
  };

  await persistRateLimitConfig(payload);

  return payload;
}
