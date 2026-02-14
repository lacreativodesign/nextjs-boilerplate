import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { ingestMetric } from "@/lib/monitoring/dashboard-service";
import { monitoringLogger } from "@/lib/monitoring/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_USAGE_LOG_KEY;
  const token = req.headers.get("x-internal-usage-key");

  if (!secret || !token || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    const event = {
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
    };

    await adminDb.collection("api_usage_logs").add(event);

    await ingestMetric({
      type: "api_response_time",
      module: "api",
      endpoint: event.endpoint,
      durationMs: event.responseTimeMs,
      metadata: {
        status: event.status,
        method: event.method,
      },
    });

    if (event.status >= 500) {
      await ingestMetric({
        type: "error_event",
        module: "api",
        endpoint: event.endpoint,
        errorCode: `HTTP_${event.status}`,
        metadata: {
          method: event.method,
        },
      });
      await monitoringLogger.error("api_usage_error_event", "api", {
        endpoint: event.endpoint,
        status: event.status,
      });
    }

    if (event.responseTimeMs > 1000) {
      await monitoringLogger.warn("api_response_time_threshold_exceeded", "api", {
        endpoint: event.endpoint,
        responseTimeMs: event.responseTimeMs,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await monitoringLogger.error("usage_log_route_failure", "api", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
