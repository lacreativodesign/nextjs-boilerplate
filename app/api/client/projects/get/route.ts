import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectDoc = {
  projectName?: string;
  projectType?: string;
  stage?: string;
  dueDate?: any;
  updatedAt?: any;
  description?: string;
  clientId?: string;
  clientName?: string;
  ownerAmName?: string | null;
  productionName?: string | null;
  clientApprovalStatus?: string;
  clientApprovedAt?: any;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const id = String(req.nextUrl.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Project is required." }, { status: 400 });
    }

    const snap = await adminDb.collection("projects").doc(id).get();
    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const data = (snap.data() || {}) as ProjectDoc;
    if (String(data.clientId || "") !== auth.clientId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const filesSnap = await adminDb
      .collection("files")
      .where("projectId", "==", id)
      .where("isDeleted", "==", false)
      .orderBy("uploadedAt", "desc")
      .limit(25)
      .get()
      .catch(() => null);

    const messagesSnap = await adminDb
      .collection("projects")
      .doc(id)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get()
      .catch(() => null);

    const files = (filesSnap?.docs || []).map((doc) => {
      const file = doc.data() || {};
      return {
        id: doc.id,
        fileName: String(file.fileName || ""),
        category: String(file.category || "Other"),
        downloadUrl: String(file.downloadUrl || ""),
        uploadedAt: toISO(file.uploadedAt),
      };
    });

    const messages = (messagesSnap?.docs || []).map((doc) => {
      const message = doc.data() || {};
      return {
        id: doc.id,
        senderName: String(message.senderName || ""),
        senderRole: String(message.senderRole || ""),
        body: String(message.body || ""),
        createdAt: toISO(message.createdAt),
      };
    });

    return NextResponse.json({
      ok: true,
      project: {
        id: snap.id,
        projectName: data.projectName || "",
        projectType: data.projectType || "",
        stage: data.stage || "Inquiry",
        dueDate: toISO(data.dueDate),
        updatedAt: toISO(data.updatedAt),
        description: data.description || "",
        clientName: data.clientName || "",
        ownerAmName: data.ownerAmName || "",
        productionName: data.productionName || "",
        clientApprovalStatus: data.clientApprovalStatus || "pending",
        clientApprovedAt: toISO(data.clientApprovedAt),
      },
      files,
      messages,
    });
  } catch (err: any) {
    console.error("client/projects get error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load project.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
