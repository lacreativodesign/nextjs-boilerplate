import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getProductionUser, isAssignedToProduction, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FileDoc = {
  projectId?: string;
  category?: string;
  fileName?: string;
  downloadUrl?: string;
  uploadedByName?: string;
  uploadedAt?: any;
  isLatest?: boolean;
  isDeleted?: boolean;
};

type ProjectDoc = {
  productionUid?: string | null;
  productionOwnerId?: string | null;
  assignedProductionIds?: string[];
  isDeleted?: boolean;
};

export async function GET(req: Request) {
  try {
    const me = await getProductionUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (project?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    if (String((project as any).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const assigned = isAssignedToProduction(
      {
        productionUid: project.productionUid ?? null,
        productionOwnerId: project.productionOwnerId ?? null,
        assignedProductionIds: project.assignedProductionIds ?? null,
      },
      me.uid
    );
    if (!assigned) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb.collection("files").where("tenantId", "==", me.tenantId).where("isDeleted", "==", false).limit(500).get();

    let files = snap.docs.map((doc) => {
      const data = doc.data() as FileDoc;
      return {
        id: doc.id,
        projectId: data.projectId || "",
        category: data.category || "Other",
        fileName: data.fileName || "",
        downloadUrl: data.downloadUrl || "",
        uploadedByName: data.uploadedByName || "",
        uploadedAt: toISO(data.uploadedAt),
        isLatest: data.isLatest ?? true,
      };
    });

    files = files.filter((file) => file.projectId === projectId);

    return NextResponse.json({ ok: true, files });
  } catch (err: any) {
    console.error("production/files list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load files right now.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
