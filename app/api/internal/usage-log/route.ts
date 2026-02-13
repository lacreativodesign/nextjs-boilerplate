import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_USAGE_LOG_KEY;
  const token = req.headers.get("x-internal-usage-key");

  if (!secret || !token || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    await adminDb.collection("api_usage_logs").add({
      endpoint: String(payload.endpoint || ""),
      tenantId: String(payload.tenantId || "unknown"),
      userId: String(payload.userId || "anonymous"),
      ip: String(payload.ip || ""),
      method: String(payload.method || "GET"),
      status: Number(payload.status || 200),
      responseTimeMs: Number(payload.responseTimeMs || 0),
      rateLimitRuleId: String(payload.rateLimitRuleId || ""),
      quotaExceeded: Boolean(payload.quotaExceeded || false),
      createdAt: payload.createdAt || new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("usage-log error", error);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
