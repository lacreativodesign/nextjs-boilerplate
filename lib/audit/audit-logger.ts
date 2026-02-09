import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { AuditAction, AuditLog, AuditResource } from "@/types/audit";

interface LogAuditParams {
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  changes?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  metadata?: {
    ip?: string;
    userAgent?: string;
    location?: string;
    sessionId?: string;
  };
  status: "success" | "failure";
  errorMessage?: string;
}

export class AuditLogger {
  private static readonly COLLECTION = "audit_logs";

  static async log(params: LogAuditParams): Promise<void> {
    try {
      const now = Timestamp.now();
      const auditLog: Omit<AuditLog, "id"> = {
        tenantId: params.tenantId,
        userId: params.userId,
        userEmail: params.userEmail,
        userName: params.userName,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        changes: params.changes,
        metadata: params.metadata || {},
        status: params.status,
        errorMessage: params.errorMessage,
        timestamp: now,
        createdAt: now,
      };

      await adminDb.collection(this.COLLECTION).add(auditLog);
    } catch (error) {
      console.error("Failed to log audit event:", error);
    }
  }

  static async logSuccess(params: Omit<LogAuditParams, "status">): Promise<void> {
    await this.log({ ...params, status: "success" });
  }

  static async logFailure(
    params: Omit<LogAuditParams, "status" | "errorMessage">,
    error: Error
  ): Promise<void> {
    await this.log({
      ...params,
      status: "failure",
      errorMessage: error.message,
    });
  }

  static async getLogs(params: {
    tenantId: string;
    filters?: {
      userId?: string;
      resource?: AuditResource;
      action?: AuditAction;
      status?: "success" | "failure";
      startDate?: Date;
      endDate?: Date;
    };
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    let query: FirebaseFirestore.Query = adminDb
      .collection(this.COLLECTION)
      .where("tenantId", "==", params.tenantId)
      .orderBy("timestamp", "desc");

    if (params.filters?.userId) {
      query = query.where("userId", "==", params.filters.userId);
    }
    if (params.filters?.resource) {
      query = query.where("resource", "==", params.filters.resource);
    }
    if (params.filters?.action) {
      query = query.where("action", "==", params.filters.action);
    }
    if (params.filters?.status) {
      query = query.where("status", "==", params.filters.status);
    }
    if (params.filters?.startDate) {
      query = query.where("timestamp", ">=", Timestamp.fromDate(params.filters.startDate));
    }
    if (params.filters?.endDate) {
      query = query.where("timestamp", "<=", Timestamp.fromDate(params.filters.endDate));
    }

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    if (params.offset) {
      query = query.offset(params.offset);
    }
    query = query.limit(params.limit || 50);

    const snapshot = await query.get();
    const logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLog[];

    return { logs, total };
  }
}
