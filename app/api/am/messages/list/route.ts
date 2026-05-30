import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getAmUser, isOwnedByAm, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectDoc = {
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

type MessageDoc = {
  projectId?: string;
  senderId?: string;
  senderRole?: string;
  senderName?: string | null;
  body?: string;
  createdAt?: any;
};

export async function GET(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project is required." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (String((project as any).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (!isOwnedByAm(project, me.uid)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("projects")
      .doc(projectId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(200)
      .get();

    const messages = snap.docs.map((doc) => {
      const data = doc.data() as MessageDoc;
      return {
        id: doc.id,
        projectId,
        senderId: data.senderId || "",
        senderRole: data.senderRole || "",
        senderName: data.senderName || null,
        body: data.body || "",
        createdAt: toISO(data.createdAt),
      };
    });

    return NextResponse.json({ ok: true, messages });
  } catch (err: any) {
    console.error("am/messages list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load messages.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
