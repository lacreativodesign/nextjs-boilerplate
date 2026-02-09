import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { AuditAction, AuditResource } from "@/types/audit";

export const runtime = "nodejs";

const querySchema = z.object({
  userId: z.string().optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  status: z.enum(["success", "failure"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(50),
  format: z.enum(["json", "csv"]).optional(),
});

function isAuditViewer(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "admin" || normalized === "super_admin" || normalized === "owner";
}

function serializeLog(log: any) {
  const timestamp = log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp;
  const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : log.createdAt;
  return {
    ...log,
    timestamp: timestamp ? new Date(timestamp).toISOString() : null,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
  };
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(logs: any[]) {
  const headers = [
    "timestamp",
    "tenantId",
    "userId",
    "userEmail",
    "userName",
    "action",
    "resource",
    "resourceId",
    "status",
    "ip",
    "userAgent",
    "sessionId",
    "errorMessage",
    "changes",
  ];
  const rows = logs.map((log) => [
    escapeCsv(log.timestamp),
    escapeCsv(log.tenantId),
    escapeCsv(log.userId),
    escapeCsv(log.userEmail),
    escapeCsv(log.userName),
    escapeCsv(log.action),
    escapeCsv(log.resource),
    escapeCsv(log.resourceId || ""),
    escapeCsv(log.status),
    escapeCsv(log.metadata?.ip || ""),
    escapeCsv(log.metadata?.userAgent || ""),
    escapeCsv(log.metadata?.sessionId || ""),
    escapeCsv(log.errorMessage || ""),
    escapeCsv(log.changes || []),
  ]);
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export async function GET(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAuditViewer(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const params = querySchema.parse({
      userId: searchParams.get("userId") || undefined,
      resource: searchParams.get("resource") || undefined,
      action: searchParams.get("action") || undefined,
      status: searchParams.get("status") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      format: searchParams.get("format") || undefined,
    });

    const offset = (params.page - 1) * params.limit;

    const { logs, total } = await AuditLogger.getLogs({
      tenantId: me.tenantId,
      filters: {
        userId: params.userId,
        resource: params.resource as AuditResource | undefined,
        action: params.action as AuditAction | undefined,
        status: params.status,
        startDate: params.startDate ? new Date(params.startDate) : undefined,
        endDate: params.endDate ? new Date(params.endDate) : undefined,
      },
      limit: params.limit,
      offset,
    });

    const serialized = logs.map(serializeLog);

    if (params.format === "csv") {
      try {
        await AuditLogger.logSuccess({
          tenantId: me.tenantId,
          userId: me.uid,
          userEmail: String(me.email || ""),
          userName: String(me.name || me.fullName || ""),
          action: "export",
          resource: "report",
          metadata: {
            userAgent: request.headers.get("user-agent") || "",
          },
        });
      } catch (auditError) {
        console.error("audit export log error:", auditError);
      }
      const csv = toCsv(serialized);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=audit-logs.csv",
        },
      });
    }

    return NextResponse.json({
      logs: serialized,
      pagination: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
