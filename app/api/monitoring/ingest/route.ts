// AUTH: Public endpoint - browser-side monitoring telemetry (web vitals, session events). Write-only; no tenant data exposed.
import { NextResponse } from "next/server";
import { ingestMetric } from "@/lib/monitoring/dashboard-service";
import type { MetricIngestPayload } from "@/lib/monitoring/types";

export const runtime = "nodejs";

function isMetricType(value: unknown): value is MetricIngestPayload["type"] {
  return (
    value === "api_response_time" ||
    value === "database_query_duration" ||
    value === "cache_event" ||
    value === "active_session" ||
    value === "error_event" ||
    value === "conversion_event" ||
    value === "web_vital"
  );
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as MetricIngestPayload;
    if (!isMetricType(payload.type)) {
      return NextResponse.json({ ok: false, error: "Invalid metric type" }, { status: 400 });
    }

    await ingestMetric(payload);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to ingest monitoring metric",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
