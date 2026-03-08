import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { ingestMetric } from "@/lib/monitoring/dashboard-service";
import { monitoringLogger } from "@/lib/monitoring/logger";
import { sendEmail } from "@/lib/email/email-service";

export const runtime = "nodejs";

const DEPRECATION_EMAIL_COOLDOWN_HOURS = 24;

function deprecationNotificationRecipients(userEmail: string) {
  const configured = (process.env.API_DEPRECATION_NOTIFY_EMAILS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (userEmail) {
    return [userEmail, ...configured.filter((value) => value !== userEmail)];
  }

  return configured;
}

function deprecationNotificationDocId(tenantId: string, endpoint: string) {
  const bucket = new Date().toISOString().slice(0, 13);
  const endpointKey = endpoint.replace(/[^a-z0-9/_-]/gi, "_").toLowerCase();
  return `${tenantId}__${endpointKey}__${bucket}`;
}

async function maybeNotifyDeprecatedUsage(event: {
  endpoint: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  method: string;
  apiVersion: string;
  createdAt: string;
}) {
  const recipients = deprecationNotificationRecipients(event.userEmail);
  if (!recipients.length) {
    return;
  }

  const docId = deprecationNotificationDocId(event.tenantId, event.endpoint);
  const docRef = adminDb.collection("api_deprecation_notifications").doc(docId);
  const snapshot = await docRef.get();

  if (snapshot.exists) {
    return;
  }

  const createdAtMs = new Date(event.createdAt).getTime();
  const expiresAt = new Date(createdAtMs + DEPRECATION_EMAIL_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

  await docRef.set({
    tenantId: event.tenantId,
    endpoint: event.endpoint,
    apiVersion: event.apiVersion,
    userId: event.userId,
    userEmail: event.userEmail,
    recipients,
    createdAt: event.createdAt,
    expiresAt,
  });

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: `[BIZOSTO ERP] Deprecated API alias in use: ${event.endpoint}`,
        html: `<p>The deprecated unversioned API alias was used.</p>
<p><strong>Tenant:</strong> ${event.tenantId}</p>
<p><strong>Endpoint:</strong> ${event.endpoint}</p>
<p><strong>Method:</strong> ${event.method}</p>
<p><strong>User:</strong> ${event.userId}</p>
<p><strong>Detected at:</strong> ${event.createdAt}</p>
<p>Please migrate integrations to <code>/api/v1/*</code> before the announced sunset.</p>`,
      })
    )
  );
}

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
      userEmail: String(payload.userEmail || ""),
      ip: String(payload.ip || ""),
      method: String(payload.method || "GET"),
      status: Number(payload.status || 200),
      responseTimeMs: Number(payload.responseTimeMs || 0),
      rateLimitRuleId: String(payload.rateLimitRuleId || ""),
      quotaExceeded: Boolean(payload.quotaExceeded || false),
      apiVersion: String(payload.apiVersion || "unversioned"),
      isDeprecatedApiAlias: Boolean(payload.isDeprecatedApiAlias || false),
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
        apiVersion: event.apiVersion,
      },
    });

    if (event.isDeprecatedApiAlias) {
      await ingestMetric({
        type: "error_event",
        module: "api",
        endpoint: event.endpoint,
        errorCode: "DEPRECATED_API_ALIAS_USAGE",
        metadata: {
          method: event.method,
          tenantId: event.tenantId,
          apiVersion: event.apiVersion,
        },
      });

      await monitoringLogger.warn("deprecated_api_alias_usage", "api", {
        endpoint: event.endpoint,
        tenantId: event.tenantId,
        userId: event.userId,
      });

      await maybeNotifyDeprecatedUsage(event);
    }

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
