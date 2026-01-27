import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, normalizeRole } from "../../admin/_utils";
import { requireApprovalsModule } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_TYPES = ["discount", "change_request", "production_override"] as const;

type ApprovalType = (typeof APPROVAL_TYPES)[number];

type ApprovalDoc = {
  tenantId?: string;
  type?: ApprovalType;
  entityType?: string;
  entityId?: string;
  requestedBy?: { uid?: string; role?: string };
  requestedData?: Record<string, any>;
  status?: "pending" | "approved" | "rejected";
  createdAt?: any;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function allowedTypes(role: string): ApprovalType[] {
  const normalized = normalizeRole(role);
  if (normalized === "admin" || normalized === "super_admin") return [...APPROVAL_TYPES];
  if (normalized === "sales_manager") return ["discount"];
  if (normalized === "am_manager") return ["change_request"];
  if (normalized === "production_manager") return ["production_override"];
  return [];
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const types = allowedTypes(me.role || "");
    if (types.length === 0) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const moduleAccess = await requireApprovalsModule(tenantId);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }
    const approvalsQuery = adminDb
      .collection("approvals")
      .where("tenantId", "==", tenantId)
      .where("status", "==", "pending")
      .where("type", "in", types);

    const approvalsSnap = await approvalsQuery.get();
    const approvals = approvalsSnap.docs.map((doc) => {
      const data = doc.data() as ApprovalDoc;
      const requestedData = data.requestedData || {};
      const title =
        requestedData.title ||
        requestedData.dealName ||
        requestedData.projectName ||
        requestedData.overrideType ||
        data.type ||
        "Approval";

      return {
        id: doc.id,
        tenantId: data.tenantId || tenantId,
        type: data.type || "discount",
        entityType: data.entityType || "",
        entityId: data.entityId || "",
        status: data.status || "pending",
        requestedAt: toISO(data.createdAt),
        requestedBy: data.requestedBy || null,
        requestedData,
        title,
      };
    });

    approvals.sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));

    return NextResponse.json({ ok: true, approvals });
  } catch (err: any) {
    console.error("approvals/pending error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load approvals." }, { status: 500 });
  }
}
