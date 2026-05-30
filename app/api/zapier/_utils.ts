import type { NextRequest } from "next/server";
import { resolveZapierTenant } from "@/lib/zapier/service";

export async function requireZapierApiKey(request: NextRequest, body?: Record<string, unknown>) {
  const headerKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const bodyKey = typeof body?.apiKey === "string" ? body.apiKey : typeof body?.api_key === "string" ? body.api_key : "";
  const apiKey = String(headerKey || bodyKey || "").trim();

  if (!apiKey) {
    return { ok: false as const, status: 401, error: "API key is required." };
  }

  const tenant = await resolveZapierTenant(apiKey);
  if (!tenant) {
    return { ok: false as const, status: 401, error: "Invalid API key." };
  }

  return { ok: true as const, tenantId: tenant.tenantId };
}
