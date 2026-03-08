import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../_utils";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentUser();
  if (!current || !isAdminOrSuper(current.role)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await adminDb.collection("api_usage_logs").orderBy("createdAt", "desc").limit(1000).get();
    const rows = snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
      .filter((row) => current.role === "super_admin" || row.tenantId === current.tenantId);

    const byEndpoint: Record<string, number> = {};
    const byHour: Record<string, number> = {};
    const byConsumer: Record<string, number> = {};

    for (const row of rows) {
      const endpoint = String(row.endpoint || "unknown");
      byEndpoint[endpoint] = (byEndpoint[endpoint] || 0) + 1;

      const createdAt = new Date(row.createdAt || Date.now());
      const hourBucket = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}-${String(createdAt.getUTCDate()).padStart(2, "0")} ${String(createdAt.getUTCHours()).padStart(2, "0")}:00`;
      byHour[hourBucket] = (byHour[hourBucket] || 0) + 1;

      const consumerKey = `${row.tenantId || "unknown"}:${row.userId || "anonymous"}`;
      byConsumer[consumerKey] = (byConsumer[consumerKey] || 0) + 1;
    }

    const endpointStats = Object.entries(byEndpoint)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const timeSeries = Object.entries(byHour)
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    const topConsumers = Object.entries(byConsumer)
      .map(([consumer, count]) => {
        const [tenantId, userId] = consumer.split(":");
        return { tenantId, userId, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      stats: {
        totalCalls: rows.length,
        endpointStats,
        timeSeries,
        topConsumers,
      },
    });
  } catch (error) {
    console.error("usage stats error", error);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
