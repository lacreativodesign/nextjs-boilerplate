import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectDoc = {
  projectName?: string;
  projectType?: string;
  stage?: string;
  dueDate?: any;
  health?: string;
  updatedAt?: any;
  clientId?: string;
  clientName?: string;
  projectCode?: string | null;
  clientApprovalStatus?: string;
  clientApprovedAt?: any;
};

function computeHealth(dueDate: string | null): "Overdue" | "At Risk" | "On Track" {
  if (!dueDate) return "On Track";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays <= 7) return "At Risk";
  return "On Track";
}

export async function GET() {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection("projects")
      .where("clientId", "==", auth.clientId)
      .where("tenantId", "==", auth.tenantId)
      .where("isDeleted", "==", false)
      .orderBy("updatedAt", "desc")
      .limit(500)
      .get();

    const projects = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as ProjectDoc;
      const dueDate = toISO(data.dueDate);
      return {
        id: doc.id,
        projectName: data.projectName || "",
        projectType: data.projectType || "",
        stage: data.stage || "Inquiry",
        dueDate,
        health: data.health || computeHealth(dueDate),
        updatedAt: toISO(data.updatedAt),
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        projectCode: data.projectCode || null,
        clientApprovalStatus: data.clientApprovalStatus || "pending",
        clientApprovedAt: toISO(data.clientApprovedAt),
      };
    });

    return NextResponse.json({ ok: true, projects });
  } catch (err: any) {
    console.error("client/projects list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load projects.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
