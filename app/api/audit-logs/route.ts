import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { AuditAction, AuditResource } from "@/types/audit";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { Timestamp } from "firebase-admin/firestore";
import { resolveErrorResponse } from "@/lib/errors";

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

function buildQuery(
  tenantId: string,
  filters?: {
    userId?: string;
    resource?: AuditResource;
    action?: AuditAction;
    status?: "success" | "failure";
    startDate?: Date;
    endDate?: Date;
  }
) {
  let query: FirebaseFirestore.Query = adminDb
    .collection("audit_logs")
    .where("tenantId", "==", tenantId)
    .orderBy("timestamp", "desc");

  if (filters?.userId) {
    query = query.where("userId", "==", filters.userId);
  }
  if (filters?.resource) {
    query = query.where("resource", "==", filters.resource);
  }
  if (filters?.action) {
    query = query.where("action", "==", filters.action);
  }
  if (filters?.status) {
    query = query.where("status", "==", filters.status);
  }
  if (filters?.startDate) {
    query = query.where("timestamp", ">=", Timestamp.fromDate(filters.startDate));
  }
  if (filters?.endDate) {
    query = query.where("timestamp", "<=", Timestamp.fromDate(filters.endDate));
  }

  return query;
}

function createCsvStream(options: {
  tenantId: string;
  filters: {
    userId?: string;
    resource?: AuditResource;
    action?: AuditAction;
    status?: "success" | "failure";
    startDate?: Date;
    endDate?: Date;
  };
}) {
  const encoder = new TextEncoder();
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let done = false;
  let headerSent = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) {
        controller.close();
        return;
      }

      let query = buildQuery(options.tenantId, options.filters).limit(500);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (!headerSent) {
        const headerLine = [
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
        ].join(",");
        controller.enqueue(encoder.encode(`${headerLine}\n`));
        headerSent = true;
      }

      if (snapshot.empty) {
        done = true;
        controller.close();
        return;
      }

      snapshot.docs.forEach((doc) => {
        const serialized = serializeLog({ id: doc.id, ...doc.data() });
        const row = [
          escapeCsv(serialized.timestamp),
          escapeCsv(serialized.tenantId),
          escapeCsv(serialized.userId),
          escapeCsv(serialized.userEmail),
          escapeCsv(serialized.userName),
          escapeCsv(serialized.action),
          escapeCsv(serialized.resource),
          escapeCsv(serialized.resourceId || ""),
          escapeCsv(serialized.status),
          escapeCsv(serialized.metadata?.ip || ""),
          escapeCsv(serialized.metadata?.userAgent || ""),
          escapeCsv(serialized.metadata?.sessionId || ""),
          escapeCsv(serialized.errorMessage || ""),
          escapeCsv(serialized.changes || []),
        ].join(",");
        controller.enqueue(encoder.encode(`${row}\n`));
      });

      lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      if (snapshot.size < 500) {
        done = true;
        controller.close();
      }
    },
  });
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

    await checkRateLimit(request, "standard", me.uid);

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

    const filters = {
      userId: params.userId,
      resource: params.resource as AuditResource | undefined,
      action: params.action as AuditAction | undefined,
      status: params.status,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    };

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
            ip: getClientIp(request),
            userAgent: request.headers.get("user-agent") || "",
          },
        });
      } catch (auditError) {
        console.error("audit export log error:", auditError);
      }
      const stream = createCsvStream({
        tenantId: me.tenantId,
        filters,
      });
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=audit-logs.csv",
        },
      });
    }

    const { logs, total } = await AuditLogger.getLogs({
      tenantId: me.tenantId,
      filters,
      limit: params.limit,
      offset,
    });

    const serialized = logs.map(serializeLog);

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
    const { status, body } = resolveErrorResponse(error, {
      fallbackMessage: "Failed to fetch audit logs",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      fallbackStatus: 500,
    });
    return NextResponse.json(body, { status });
  }
}
